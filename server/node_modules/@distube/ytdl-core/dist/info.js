import { relatedVideos } from "./discovery.js";
import { userAgentHeader } from "./clients.js";
import { YtdlError } from "./errors.js";
import { ignore } from "./http.js";
import { parseHlsMaster, sameFormat } from "./formats.js";
import { at, collect, isRecord, list, num, parseAbbreviated, parseClock, str, text, thumbnails, } from "./json.js";
function author(player, next) {
    const details = at(player, "videoDetails");
    const micro = at(player, "microformat", "playerMicroformatRenderer");
    const owner = collect(next, "videoOwnerRenderer")[0];
    const id = str(at(details, "channelId")) ?? str(at(micro, "externalChannelId")) ?? "";
    const badges = collect(owner, "metadataBadgeRenderer");
    return {
        id,
        name: str(at(details, "author")) ?? str(at(micro, "ownerChannelName")) ?? text(at(owner, "title")) ?? "",
        url: str(at(micro, "ownerProfileUrl")) ?? (id ? `https://www.youtube.com/channel/${id}` : ""),
        thumbnails: thumbnails(at(owner, "thumbnail", "thumbnails")),
        verified: owner ? badges.some((badge) => /VERIFIED/u.test(String(at(badge, "style")))) : undefined,
        subscriberCount: parseAbbreviated(text(at(owner, "subscriberCountText"))),
    };
}
// The spec is one string of `|`-separated levels.
function storyboards(player) {
    const spec = str(at(player, "storyboards", "playerStoryboardSpecRenderer", "spec"));
    if (!spec)
        return [];
    const [base, ...levels] = spec.split("|");
    if (!base)
        return [];
    return levels.flatMap((level, index) => {
        const [width, height, count, columns, rows, interval, name, sigh] = level.split("#");
        const values = [width, height, count, columns, rows, interval].map(Number);
        if (values.some((value) => !Number.isFinite(value)) || !name || !sigh)
            return [];
        const [thumbnailWidth = 0, thumbnailHeight = 0, thumbnailCount = 0, cols = 1, rowCount = 1, ms = 0] = values;
        const url = new URL(base.replace("$L", String(index)).replace("$N", name));
        url.searchParams.set("sigh", sigh);
        return [
            {
                templateUrl: url.href.replaceAll("%24M", "$M"),
                thumbnailWidth,
                thumbnailHeight,
                thumbnailCount,
                interval: ms,
                columns: cols,
                rows: rowCount,
                storyboardCount: Math.ceil(thumbnailCount / (cols * rowCount)),
            },
        ];
    });
}
function chapters(next) {
    const fromMarkers = collect(next, "chapterRenderer").flatMap((chapter) => {
        const title = text(at(chapter, "title"));
        const start = num(at(chapter, "timeRangeStartMillis"));
        return title !== undefined && start !== undefined ? [{ title, startTime: start / 1000 }] : [];
    });
    if (fromMarkers.length > 0)
        return fromMarkers;
    return collect(next, "macroMarkersListItemRenderer").flatMap((item) => {
        const title = text(at(item, "title"));
        const start = num(at(item, "onTap", "watchEndpoint", "startTimeSeconds")) ?? parseClock(text(at(item, "timeDescription")));
        return title !== undefined && start !== undefined ? [{ title, startTime: start }] : [];
    });
}
function likes(next) {
    for (const button of collect(next, "likeButtonViewModel")) {
        for (const label of collect(button, "buttonViewModel")) {
            const accessibility = str(at(label, "accessibilityText"));
            if (accessibility && /along with/iu.test(accessibility))
                return parseAbbreviated(accessibility.split(/along with/iu)[1]);
        }
    }
    return undefined;
}
function videoDetails(player, next, context) {
    const details = at(player, "videoDetails");
    const micro = at(player, "microformat", "playerMicroformatRenderer");
    const id = str(at(details, "videoId")) ?? "";
    const countries = at(micro, "availableCountries");
    const keywords = at(details, "keywords");
    const familySafe = at(micro, "isFamilySafe");
    return {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: str(at(details, "title")) ?? text(at(micro, "title")) ?? "",
        description: str(at(details, "shortDescription")) ?? text(at(micro, "description")),
        lengthSeconds: num(at(details, "lengthSeconds")) ?? 0,
        viewCount: num(at(details, "viewCount")),
        likes: likes(next),
        publishDate: str(at(micro, "publishDate")),
        uploadDate: str(at(micro, "uploadDate")),
        keywords: Array.isArray(keywords) ? keywords.filter((word) => typeof word === "string") : [],
        category: str(at(micro, "category")),
        thumbnails: thumbnails(at(details, "thumbnail", "thumbnails")),
        author: author(player, next),
        isLive: at(details, "isLive") === true,
        isUpcoming: at(details, "isUpcoming") === true,
        isUnlisted: typeof at(micro, "isUnlisted") === "boolean" ? at(micro, "isUnlisted") : undefined,
        isFamilySafe: typeof familySafe === "boolean" ? familySafe : undefined,
        isAgeRestricted: context.ageRestricted || familySafe === false,
        availableCountries: Array.isArray(countries)
            ? countries.filter((c) => typeof c === "string")
            : undefined,
        chapters: chapters(next),
        storyboards: storyboards(player),
    };
}
function captionTracks(player) {
    const renderer = at(player, "captions", "playerCaptionsTracklistRenderer");
    const audioTrack = at(renderer, "audioTracks", num(at(renderer, "defaultAudioTrackIndex")) ?? 0);
    const defaultIndex = num(at(audioTrack, "defaultCaptionTrackIndex"));
    return list(at(renderer, "captionTracks")).flatMap((track, index) => {
        const url = str(at(track, "baseUrl"));
        const languageCode = str(at(track, "languageCode"));
        if (!url || !languageCode)
            return [];
        return [
            {
                languageCode,
                name: text(at(track, "name")) ?? languageCode,
                isAutoGenerated: at(track, "kind") === "asr",
                isDefault: index === defaultIndex,
                url,
            },
        ];
    });
}
function toInfo(base, resolution, formats) {
    return {
        videoDetails: base.videoDetails,
        relatedVideos: base.relatedVideos,
        playerResponse: base.playerResponse,
        captionTracks: base.captionTracks,
        formats,
        client: resolution.client,
        hlsManifestUrl: resolution.hlsManifestUrl,
        sabr: resolution.sabr,
        visitorData: resolution.visitorData,
        expiresAt: resolution.expiresAt,
        playableAt: resolution.playableAt,
    };
}
async function basicInfo(innertube, id, resolution, signal) {
    const visitor = resolution.visitorData;
    const [next, web] = await Promise.all([
        innertube.next(id, visitor, signal).catch(() => ({})),
        at(resolution.player, "microformat") === undefined
            ? innertube.webMetadata(id, visitor, signal).catch(() => ({}))
            : Promise.resolve({}),
    ]);
    signal?.throwIfAborted();
    const microformat = at(resolution.player, "microformat") ?? at(web, "microformat");
    const player = isRecord(microformat) ? { ...resolution.player, microformat } : resolution.player;
    const ageRestricted = resolution.attempts.some((attempt) => attempt.code === "AGE_RESTRICTED");
    return {
        videoDetails: videoDetails(player, next, { ageRestricted }),
        relatedVideos: relatedVideos(next),
        playerResponse: player,
        captionTracks: captionTracks(player),
    };
}
async function playableFormats(innertube, resolution, signal) {
    if (at(resolution.player, "videoDetails", "isLive") !== true || !resolution.hlsManifestUrl) {
        return resolution.formats;
    }
    let playlist;
    try {
        playlist = await innertube.text(resolution.hlsManifestUrl, { headers: userAgentHeader(resolution.client), signal }, "YouTube HLS manifest");
    }
    catch (error) {
        const failed = YtdlError.is(error, "REQUEST_FAILED") || YtdlError.is(error, "RATE_LIMITED");
        if (signal?.aborted || !failed || !resolution.formats.some((format) => format.isLive))
            throw error;
        return resolution.formats;
    }
    return [...parseHlsMaster(playlist, resolution.hlsManifestUrl, resolution.client), ...resolution.formats];
}
export async function lookupInfo(innertube, resolver, id, signal, format) {
    const resolution = await resolver.resolve(id, { signal, format });
    const [base, formats] = await Promise.all([
        basicInfo(innertube, id, resolution, signal),
        playableFormats(innertube, resolution, signal),
    ]);
    return toInfo(base, resolution, formats);
}
export async function resumeInfo(innertube, resolver, request) {
    const { info: previous, format: failed, attempt, reason, signal } = request;
    if (attempt <= 1) {
        if (previous.visitorData)
            await innertube.replaceVisitorData(previous.visitorData, signal, { keepOnFailure: true }).catch(ignore);
    }
    else if (reason === "HTTP 403") {
        resolver.block(failed.client);
    }
    const resolution = await resolver.resolve(previous.videoDetails.id, {
        signal,
        format: failed,
        prefer: attempt <= 1 ? [failed.client] : undefined,
    });
    const formats = await playableFormats(innertube, resolution, signal);
    const format = formats.find((candidate) => sameFormat(candidate, failed) && candidate.contentLength === failed.contentLength);
    if (!format)
        throw new YtdlError("NO_FORMAT", `No client offers the same itag ${failed.itag} file after ${reason}`);
    const base = { ...previous, playerResponse: resolution.player, captionTracks: captionTracks(resolution.player) };
    return { info: toInfo(base, resolution, formats), format };
}
