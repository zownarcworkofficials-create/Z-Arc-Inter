import { createFormatKey, EnabledTrackTypes } from './formatUtils.js';
import { Track } from './Track.js';
export class TrackCollection {
    video = new Track('video');
    audio = new Track('audio');
    initializedTracksMap = new Map();
    get needsDrain() {
        return this.video.streamFull || this.audio.streamFull;
    }
    get buffered() {
        let bufferedUntil = Infinity;
        for (const track of this.initializedTracks) {
            const summary = track.bufferedRangeSummary;
            if (!summary)
                return 0;
            bufferedUntil = Math.min(bufferedUntil, summary.startTimeMs + summary.durationMs);
        }
        return bufferedUntil;
    }
    get bufferedRanges() {
        const ranges = [];
        for (const track of this.initializedTracks) {
            const summary = track.bufferedRangeSummary;
            if (!summary)
                continue;
            ranges.push({
                formatId: track.formatId,
                startTimeMs: summary.startTimeMs === 0 ? '' : String(summary.startTimeMs),
                durationMs: String(summary.durationMs),
                startSegmentIndex: summary.startSegmentIndex,
                endSegmentIndex: summary.endSegmentIndex,
                timeRange: {
                    startTicks: String(summary.startTimeMs),
                    durationTicks: String(summary.durationMs),
                    timescale: 1000
                }
            });
        }
        return ranges;
    }
    get initializedTracks() {
        return this.initializedTracksMap.values();
    }
    get initializationFormatIds() {
        const formatIds = [];
        if (this.video.formatId)
            formatIds.push(this.video.formatId);
        if (this.audio.formatId)
            formatIds.push(this.audio.formatId);
        return formatIds;
    }
    get livePlaybackLatencyMs() {
        const videoLatency = this.video.latencyMs;
        const audioLatency = this.audio.latencyMs;
        if (videoLatency === undefined && audioLatency === undefined)
            return undefined;
        return Math.max(videoLatency ?? 0, audioLatency ?? 0);
    }
    initialize(type, metadata) {
        this[type].update(metadata);
        if ('formatId' in metadata && metadata.formatId !== undefined)
            this.initializedTracksMap.set(createFormatKey(metadata.formatId), this[type]);
    }
    getInitializedTrack(formatKey) {
        return this.initializedTracksMap.get(formatKey);
    }
    endOfStreamReached(enabledTrackTypes) {
        const videoEndOfStreamReached = this.video.endOfStreamReached;
        const audioEndOfStreamReached = this.audio.endOfStreamReached;
        return (videoEndOfStreamReached && audioEndOfStreamReached)
            || (enabledTrackTypes === EnabledTrackTypes.VIDEO_ONLY && videoEndOfStreamReached)
            || (enabledTrackTypes === EnabledTrackTypes.AUDIO_ONLY && audioEndOfStreamReached);
    }
    snapshot() {
        const trackStates = [];
        for (const initializedTrack of this.initializedTracksMap.values())
            trackStates.push(initializedTrack.snapshot());
        return trackStates;
    }
    error(err) {
        const errorInstance = typeof err === 'string' ? new Error(err) : err;
        this.video.streamController.error(errorInstance);
        this.audio.streamController.error(errorInstance);
    }
    close() {
        this.video.streamController.close();
        this.audio.streamController.close();
    }
}
//# sourceMappingURL=TrackCollection.js.map