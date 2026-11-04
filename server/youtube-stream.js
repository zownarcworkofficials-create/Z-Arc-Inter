'use strict';

const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const PORT = Number(process.env.YT_PORT || 3000);
const HOST = process.env.YT_HOST || '127.0.0.1';

const ytdlClient = new ytdl.Ytdl();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

/* Accepts either a full YouTube/HTTP(S) URL or a free-text search query
   (track title / artist). Resolves plain-text queries via yt-search. */
async function resolveVideoId(query) {
    const trimmed = String(query || '').trim();
    const looksLikeUrl = /^https?:\/\//i.test(trimmed);
    if (looksLikeUrl) {
        try { return ytdl.parseVideoId(trimmed); } catch (e) { return null; }
    }
    const results = await ytSearch(trimmed);
    const top = results && results.hits && results.hits[0];
    const videoId = top && top.id ? top.id.videoId : null;
    return videoId || null;
}

function pickBestThumbnail(thumbnails) {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
    let bestUrl = null;
    let bestHeight = -1;
    let bestWidth = -1;
    for (let i = 0; i < thumbnails.length; i++) {
        const t = thumbnails[i];
        const url = t && (t.url || (t.thumbnail && t.thumbnail.url));
        if (!url) continue;
        const height = Number(t && t.height) || 0;
        const width = Number(t && t.width) || 0;
        if (height > bestHeight || (height === bestHeight && width > bestWidth)) {
            bestUrl = url;
            bestHeight = height;
            bestWidth = width;
        }
    }
    return bestUrl;
}

function streamResponse(info, format) {
    const videoDetails = (info && info.videoDetails) || {};
    const thumbnail = pickBestThumbnail(videoDetails.thumbnails) || (videoDetails.thumbnails && videoDetails.thumbnails[0]
        ? videoDetails.thumbnails[0].url
        : null);
    return {
        streamUrl: format.url,
        url: format.url,
        title: videoDetails.title || null,
        thumbnail: thumbnail,
        mimeType: format.mimeType || null,
        bitrate: format.bitrate || null,
        contentLength: format.contentLength || null
    };
}

app.get('/stream', async (req, res) => {
    const query = String(req.query.url || '').trim();
    const videoId = await resolveVideoId(query);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube/YouTube Music URL or no matching track found' });
    }
    try {
        const info = await ytdlClient.getInfo(videoId);
        const format = ytdl.chooseFormat(info.formats, {
            quality: 'highestaudio',
            filter: (format) => format.hasAudio && !format.hasVideo
        });
        if (!format || !format.url) {
            return res.status(500).json({ error: 'No audio-only stream found' });
        }
        res.json(streamResponse(info, format));
    } catch (error) {
        res.status(500).json({ error: error && error.message ? error.message : String(error) });
    }
});

app.get('/api/youtube/stream', async (req, res) => {
    const query = String(req.query.url || '').trim();
    const videoId = await resolveVideoId(query);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube/YouTube Music URL or no matching track found' });
    }
    try {
        const info = await ytdlClient.getInfo(videoId);
        const format = ytdl.chooseFormat(info.formats, {
            quality: 'highestaudio',
            filter: (format) => format.hasAudio && !format.hasVideo
        });
        if (!format || !format.url) {
            return res.status(500).json({ error: 'No audio-only stream found' });
        }
        res.json(streamResponse(info, format));
    } catch (error) {
        res.status(500).json({ error: error && error.message ? error.message : String(error) });
    }
});

async function fetchLyricsForTitle(trackTitle) {
    const t = String(trackTitle || '').trim();
    try {
        const lrclibUrl = 'https://lrclib.net/api/search?q=' + encodeURIComponent(t);
        const lrclibRes = await fetch(lrclibUrl);
        if (!lrclibRes.ok) return [];
        const lrclibData = await lrclibRes.json();
        const hits = lrclibData && lrclibData.hits;
        if (!hits || !hits.length) return [];
        const hit = hits[0];
        const syncedLyrics = hit ? hit.syncedLyrics : null;
        if (!syncedLyrics) return [];
        const lines = syncedLyrics.split('\n');
        const parsedLyrics = lines.map(line => {
            const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
            if (match) {
                const time = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
                return { time: time, text: match[4].trim() };
            }
            return null;
        }).filter(item => item !== null);
        return parsedLyrics;
    } catch (error) {
        return [];
    }
}

app.get('/api/lyrics', async (req, res) => {
    const lyrics = await fetchLyricsForTitle(req.query.title);
    return res.json({ lyrics: lyrics });
});

app.get('/api/youtube/lyrics', async (req, res) => {
    const lyrics = await fetchLyricsForTitle(req.query.title);
    return res.json({ lyrics: lyrics });
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'youtube-stream', port: PORT });
});

app.listen(PORT, HOST, () => {
    console.log('YouTube stream backend listening on http://' + HOST + ':' + PORT);
});
