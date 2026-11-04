'use strict';

/*
 * Server-side audio conversion API.
 *
 * AAC-LC is encoded with Apple's CoreAudio AAC encoder through qaac64.exe.
 * FFmpeg is still used to decode any input format to a temporary WAV, and for
 * every non-AAC output format. The default AAC target is 320 kbps CBR.
 *
 * The old FDK path remains available with AAC_ENCODER=fdk, but it is not the
 * default and is not used by the UI.
 *
 * Run:
 *   AAC_ENCODER=apple QAAC_BIN="C:\Program Files\foobar2000\encoders\qaac64.exe" \
 *     FFMPEG_BIN=/opt/ffmpeg-fdk/bin/ffmpeg node server/index.js
 *
 * Environment:
 *   PORT                 HTTP port (default 8787)
 *   HOST                 bind address (default 127.0.0.1)
 *   AAC_ENCODER          apple (default) or fdk
 *   QAAC_BIN             path to qaac64.exe/qaac.exe (Apple AAC wrapper)
 *   FFMPEG_BIN           path to ffmpeg used for decoding and other formats
 *   FFPROBE_BIN          path to ffprobe (default: sibling of FFMPEG_BIN)
 *   STATIC_DIR           website directory (default: repository root)
 *   MAX_UPLOAD_BYTES     upload limit (default 512 MiB)
 *   JOB_TIMEOUT_MS       conversion timeout (default 15 minutes)
 *   ALLOWED_ORIGIN       CORS origin (default *)
 *   SKIP_AAC_CHECK=1     start without verifying the AAC encoder
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { createMediaTools, normalizeFormat } = require('./media-tools');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const AAC_ENCODER = 'apple';

function executableName(base) {
    return process.platform === 'win32' ? base + '.exe' : base;
}

function isFile(file) {
    try {
        return fs.statSync(file).isFile();
    } catch (error) {
        return false;
    }
}

function isPathLike(value) {
    return path.isAbsolute(value) || /[\\/]/.test(value);
}

// Resolve a tool from an explicit env var first, then from the bundled
// ffmpeg-fdk prefix, then from PATH. A stale FFMPEG_BIN (for example a prefix
// that was moved) used to make the server report healthy while every
// conversion failed with "spawn ... ENOENT". Detect that case and fall back.
function resolveToolPath(envValue, baseName, searchDirs) {
    const fileName = executableName(baseName);

    if (envValue) {
        if (isFile(envValue)) return path.resolve(envValue);
        if (!isPathLike(envValue)) return envValue; // Let the OS resolve PATH.
        console.warn('WARNING: ' + baseName + ' was not found at ' + envValue);
    }

    for (const dir of searchDirs) {
        if (!dir) continue;
        const candidate = path.join(dir, fileName);
        if (isFile(candidate)) {
            if (envValue && path.resolve(candidate) !== path.resolve(envValue)) {
                console.warn('WARNING: using ' + candidate + ' instead of ' + envValue);
            }
            return candidate;
        }
    }

    return envValue && !isPathLike(envValue) ? envValue : fileName;
}

const FFMPEG_SEARCH_DIRS = [
    path.join(__dirname, '..', 'ffmpeg-fdk', 'bin'),
    path.join(__dirname, '..', 'ffmpeg-fdk-build', 'bin'),
    path.join(__dirname, '..', 'ffmpeg', 'bin'),
    path.join(__dirname, 'bin')
];
let FFMPEG_BIN = resolveToolPath(process.env.FFMPEG_BIN, 'ffmpeg', FFMPEG_SEARCH_DIRS);
const FFPROBE_SEARCH_DIRS = [
    path.isAbsolute(FFMPEG_BIN) ? path.dirname(FFMPEG_BIN) : null
].concat(FFMPEG_SEARCH_DIRS);
let FFPROBE_BIN = resolveToolPath(process.env.FFPROBE_BIN, 'ffprobe', FFPROBE_SEARCH_DIRS);
const QAAC_BIN = process.env.QAAC_BIN || defaultQaacBin();

// Re-check the resolved binaries. If a build directory is moved or deleted
// while this process is running, fall back to the bundled copy instead of
// failing every conversion with "spawn ... ENOENT".
function refreshToolPaths() {
    if (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN)) {
        const replacement = resolveToolPath(null, 'ffmpeg', FFMPEG_SEARCH_DIRS);
        if (replacement !== FFMPEG_BIN) {
            console.warn('WARNING: ' + FFMPEG_BIN + ' is gone; using ' + replacement);
            FFMPEG_BIN = replacement;
        }
    }

    const probeDirs = (path.isAbsolute(FFMPEG_BIN) ? [path.dirname(FFMPEG_BIN)] : [])
        .concat(FFMPEG_SEARCH_DIRS);
    if (path.isAbsolute(FFPROBE_BIN) && !isFile(FFPROBE_BIN)) {
        const replacement = resolveToolPath(null, 'ffprobe', probeDirs);
        if (replacement !== FFPROBE_BIN) {
            console.warn('WARNING: ' + FFPROBE_BIN + ' is gone; using ' + replacement);
            FFPROBE_BIN = replacement;
        }
    }
}
const QAAC_CWD = path.isAbsolute(QAAC_BIN) ? path.dirname(QAAC_BIN) : undefined;
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..'));
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 512 * 1024 * 1024);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 15 * 60 * 1000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const SKIP_AAC_CHECK = process.env.SKIP_AAC_CHECK === '1' ||
    process.env.SKIP_FDK_CHECK === '1';
const APPLE_AAC_DEFAULT_KBPS = 320;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8'
};

const PROFILE_MAP = {
    AACLC: 'aac_low',
    AACHE: 'aac_he',
    AACHEV2: 'aac_he_v2',
    AACLD: 'aac_ld',
    AACELD: 'aac_eld'
};

function defaultQaacBin() {
    if (process.platform === 'win32') {
        const candidates = [
            'C:\\Program Files\\foobar2000\\encoders\\qaac64.exe',
            'C:\\Program Files (x86)\\foobar2000\\encoders\\qaac.exe',
            path.join(__dirname, '..', 'vendor', 'qaac', 'qaac64.exe')
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
        return 'qaac64.exe';
    }
    return 'qaac';
}

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

let fdkState = {
    ok: false,
    registered: false,
    encoder: false,
    checkedAt: null,
    error: null
};

let aacState = {
    ok: false,
    encoder: 'apple-aac',
    qaac: QAAC_BIN,
    version: null,
    coreAudioToolbox: null,
    checkedAt: null,
    error: null
};

function run(command, args, options) {
    const opts = options || {};
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        let stdout = '';
        let stderr = '';
        const child = spawn(command, args, {
            cwd: opts.cwd,
            env: opts.env,
            windowsHide: true
        });

        function finish(fn, value) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            fn(value);
        }

        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (error) => finish(reject, error));
        child.on('close', (code, signal) => {
            finish(resolve, { code, signal, stdout, stderr });
        });

        if (opts.timeoutMs > 0) {
            timer = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch (error) { /* ignore */ }
                finish(reject, new Error('Process timed out after ' +
                    Math.round(opts.timeoutMs / 1000) + ' seconds'));
            }, opts.timeoutMs);
        }
    });
}

function sanitizeFilename(name) {
    const base = String(name || 'input')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
        .replace(/^\.+/, '')
        .trim()
        .slice(0, 180);
    return base || 'input';
}

function inputExtension(name) {
    const match = /\.([a-z0-9]{1,10})$/i.exec(name || '');
    return match ? '.' + match[1].toLowerCase() : '.bin';
}

function normalizeMode(value) {
    const mode = String(value || 'VARIABLE').toUpperCase();
    return ['CONSTANT', 'AVERAGE', 'CONSTRAINED', 'VARIABLE'].indexOf(mode) !== -1
        ? mode
        : 'VARIABLE';
}

function normalizeProfile(value) {
    const raw = String(value || 'AACLC').toUpperCase().replace(/[-_\s]/g, '');
    if (raw === 'LC' || raw === 'AACLC') return 'AACLC';
    if (raw === 'HE' || raw === 'AACHE' || raw === 'HEAAC') return 'AACHE';
    if (raw === 'HEV2' || raw === 'AACHEV2' || raw === 'HEAACV2') return 'AACHEV2';
    if (raw === 'LD' || raw === 'AACLD') return 'AACLD';
    if (raw === 'ELD' || raw === 'AACELD') return 'AACELD';
    return 'AACLC';
}

function clampInteger(value, min, max, fallback) {
    const number = parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

const mediaTools = createMediaTools({
    run: run,
    ffmpegBin: () => FFMPEG_BIN,
    ffprobeBin: () => FFPROBE_BIN,
    HttpError: HttpError,
    clampInteger: clampInteger,
    timeoutMs: () => JOB_TIMEOUT_MS
});

function buildAacArgs(options) {
    const input = options.input;
    const output = options.output;
    const mode = normalizeMode(options.mode);
    const bitrate = clampInteger(options.bitrate, 6, 512, APPLE_AAC_DEFAULT_KBPS);
    const rate = clampInteger(options.rate, 8000, 96000, 44100);
    const profile = normalizeProfile(options.profile);
    const fdkProfile = PROFILE_MAP[profile];

    if (!input || !output) throw new HttpError(500, 'buildAacArgs needs input and output paths');
    if (!fdkProfile) throw new HttpError(400, 'Unsupported AAC profile: ' + profile);

    const args = [
        '-hide_banner', '-nostdin', '-v', 'error', '-y',
        '-i', input,
        '-map', '0:a:0', '-vn',
        '-map_metadata', '0',
        '-map_metadata:s:a:0', '0:s:a:0',
        '-map_chapters', '0',
        '-ar', String(rate),
        '-c:a', 'libfdk_aac',
        '-profile:a', fdkProfile
    ];

    // libfdk_aac has exactly two rate-control families in FFmpeg:
    //   -vbr 0 = CBR (with -b:a)
    //   -vbr 1..5 = quality VBR (AAC-LC only)
    // It has no native ABR or CVBR switch. ABR/CVBR requests use CBR at the
    // selected average; VBR uses the requested VBR 5 template.
    if (mode === 'VARIABLE') {
        if (fdkProfile !== 'aac_low') {
            throw new HttpError(400, 'libfdk_aac VBR is only available for AAC-LC. Choose AAC-LC or use CBR/ABR/CVBR.');
        }
        args.push('-vbr', '5');
    } else {
        args.push('-vbr', '0', '-b:a', bitrate + 'k');
    }

    if (Array.isArray(options.metadataArgs) && options.metadataArgs.length) {
        args.push.apply(args, options.metadataArgs);
    }

    args.push('-movflags', '+faststart+use_metadata_tags', output);
    return args;
}

function buildDecodeArgs(options) {
    const input = options.input;
    const output = options.output;
    const rate = clampInteger(options.rate, 8000, 96000, 44100);
    if (!input || !output) throw new HttpError(500, 'buildDecodeArgs needs input and output paths');

    return [
        '-hide_banner', '-nostdin', '-v', 'error', '-y',
        '-i', input,
        '-map', '0:a:0', '-vn',
        '-ar', String(rate),
        '-c:a', 'pcm_s24le',
        output
    ];
}

function buildQaacArgs(options) {
    const input = options.input;
    const output = options.output;
    const mode = normalizeMode(options.mode);
    const bitrate = clampInteger(options.bitrate, 6, 320, APPLE_AAC_DEFAULT_KBPS);
    const profile = normalizeProfile(options.profile);

    if (!input || !output) throw new HttpError(500, 'buildQaacArgs needs input and output paths');
    if (profile !== 'AACLC') {
        throw new HttpError(400, 'Apple AAC currently supports AAC-LC only. Choose AAC-LC.');
    }

    const args = ['--no-optimize', '--quality', '2'];
    if (mode === 'CONSTANT') {
        args.push('--cbr', String(bitrate));
    } else if (mode === 'AVERAGE') {
        args.push('--abr', String(bitrate));
    } else if (mode === 'CONSTRAINED') {
        args.push('--cvbr', String(bitrate));
    } else {
        // Apple's highest true-VBR quality. The selected kbps target is not
        // meaningful in this mode; the actual average is reported back.
        args.push('--tvbr', '127');
    }
    args.push('-o', output, input);
    return args;
}

function appleAacMaxKbps(rate, channels) {
    const hz = Number(rate) || 44100;
    const count = Math.max(1, Number(channels) || 2);
    if (count === 1) {
        if (hz >= 44100) return 256;
        if (hz >= 32000) return 96;
        if (hz >= 22050) return 64;
        if (hz >= 16000) return 48;
        if (hz >= 12000) return 32;
        return 24;
    }
    if (count === 2) {
        if (hz >= 44100) return 320;
        if (hz >= 32000) return 192;
        if (hz >= 22050) return 128;
        if (hz >= 16000) return 96;
        if (hz >= 12000) return 64;
        return 48;
    }
    // The UI only exposes up to 320 kbps for AAC. Apple's multichannel
    // encoder can go higher, but 320 remains a valid target for every layout.
    return 320;
}

async function probeAudioInfo(file) {
    try {
        const result = await run(FFPROBE_BIN, [
            '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=channels,sample_rate',
            '-of', 'json',
            file
        ], { timeoutMs: 20000 });
        const parsed = JSON.parse(String(result.stdout || '{}'));
        const stream = parsed.streams && parsed.streams[0];
        return {
            channels: Number(stream && stream.channels) || 2,
            rate: Number(stream && stream.sample_rate) || 44100
        };
    } catch (error) {
        return { channels: 2, rate: 44100 };
    }
}

function readBodyToFile(req, target, limit) {
    return new Promise((resolve, reject) => {
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > limit) {
            reject(new HttpError(413, 'Upload is larger than the configured limit'));
            req.resume();
            return;
        }

        const out = fs.createWriteStream(target);
        let total = 0;
        let finished = false;

        function fail(error) {
            if (finished) return;
            finished = true;
            req.unpipe(out);
            out.destroy();
            req.resume();
            reject(error);
        }

        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limit) {
                fail(new HttpError(413, 'Upload is larger than the configured limit'));
            }
        });
        req.on('error', fail);
        req.on('aborted', () => fail(new HttpError(400, 'Upload aborted')));
        out.on('error', fail);
        out.on('finish', () => {
            if (finished) return;
            finished = true;
            resolve(total);
        });
        req.pipe(out);
    });
}

async function probeDuration(file) {
    try {
        const result = await run(FFPROBE_BIN, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1',
            file
        ], { timeoutMs: 20000 });
        const value = parseFloat(String(result.stdout).trim());
        return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
        return 0;
    }
}

async function probeStreamBitrateKbps(file) {
    try {
        const result = await run(FFPROBE_BIN, [
            '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=bit_rate',
            '-of', 'default=nw=1:nk=1',
            file
        ], { timeoutMs: 20000 });
        const value = parseInt(String(result.stdout).trim(), 10);
        return Number.isFinite(value) && value > 0 ? Math.round(value / 1000) : 0;
    } catch (error) {
        return 0;
    }
}

async function verifyFdk() {
    refreshToolPaths();
    const state = {
        ok: false,
        registered: false,
        encoder: false,
        checkedAt: new Date().toISOString(),
        error: null
    };

    if (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN)) {
        state.error = 'FFmpeg was not found at ' + FFMPEG_BIN +
            '. Set FFMPEG_BIN, or place ffmpeg in ffmpeg-fdk/bin.';
        return state;
    }

    try {
        const codecs = await run(FFMPEG_BIN, ['-hide_banner', '-codecs'], {
            timeoutMs: 20000
        });
        const text = String(codecs.stdout) + String(codecs.stderr);
        state.registered = /(^|\n)[^\n]*\blibfdk_aac\b/m.test(text);
        if (!state.registered) {
            state.error = 'libfdk_aac is not listed by ffmpeg -codecs';
            return state;
        }

        const help = await run(FFMPEG_BIN, ['-hide_banner', '-h', 'encoder=libfdk_aac'], {
            timeoutMs: 20000
        });
        state.encoder = help.code === 0 &&
            /libfdk_aac/.test(String(help.stdout) + String(help.stderr));
        state.ok = state.encoder;
        if (!state.encoder) state.error = 'ffmpeg lists libfdk_aac but cannot open the encoder';
    } catch (error) {
        state.error = error && error.message ? error.message : String(error);
    }

    return state;
}

async function verifyAppleAac() {
    refreshToolPaths();
    const state = {
        ok: false,
        encoder: 'apple-aac',
        qaac: QAAC_BIN,
        version: null,
        coreAudioToolbox: null,
        checkedAt: new Date().toISOString(),
        error: null
    };
    let tempDir = null;

    if (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN)) {
        state.error = 'FFmpeg was not found at ' + FFMPEG_BIN +
            '. Set FFMPEG_BIN, or place ffmpeg in ffmpeg-fdk/bin.';
        return state;
    }
    if (path.isAbsolute(QAAC_BIN) && !isFile(QAAC_BIN)) {
        state.error = 'qaac was not found at ' + QAAC_BIN +
            '. Set QAAC_BIN to qaac64.exe with CoreAudioToolbox.dll next to it.';
        return state;
    }

    try {
        // A tiny real encode is the strongest check: it proves FFmpeg can
        // produce PCM, qaac can load Apple's CoreAudioToolbox, and the
        // AAC-LC encoder can actually open at the default 320 kbps target.
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-verify-'));
        const wav = path.join(tempDir, 'verify.wav');
        const m4a = path.join(tempDir, 'verify.m4a');

        const generated = await run(FFMPEG_BIN, [
            '-hide_banner', '-nostdin', '-v', 'error', '-y',
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', '0.1',
            '-c:a', 'pcm_s24le',
            wav
        ], { timeoutMs: 20000 });
        if (generated.code !== 0) {
            const detail = String(generated.stderr || generated.stdout || '').trim();
            state.error = 'FFmpeg could not create the AAC verification WAV: ' +
                (detail || ('exit code ' + generated.code));
            return state;
        }

        const encoded = await run(QAAC_BIN, [
            '--no-optimize', '--quality', '2', '--cbr', '320',
            '-o', m4a, wav
        ], {
            timeoutMs: 20000,
            cwd: QAAC_CWD
        });
        const text = String(encoded.stdout) + String(encoded.stderr);
        const version = /qaac\s+([\d.]+)/i.exec(text);
        const core = /CoreAudioToolbox\s+([\d.]+)/i.exec(text);
        state.version = version ? version[1] : null;
        state.coreAudioToolbox = core ? core[1] : 'loaded';

        if (encoded.code !== 0) {
            state.error = 'qaac test encode failed: ' +
                (text.trim() || ('exit code ' + encoded.code));
            return state;
        }
        if (!fs.existsSync(m4a) || !fs.statSync(m4a).size) {
            state.error = 'qaac test encode produced no output';
            return state;
        }
        state.ok = true;
    } catch (error) {
        state.error = error && error.message ? error.message : String(error);
    } finally {
        if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
        }
    }

    return state;
}

function applyCors(res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Allow file:// pages and other local origins to reach the conversion
    // backend when Chrome applies Private Network Access checks to localhost.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Expose-Headers',
        'Content-Disposition, X-Actual-Bitrate, X-Sample-Rate, ' +
        'X-Output-Format, X-Encoder, X-AAC-Encoder, X-AAC-Mode');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendError(res, statusCode, message) {
    if (res.headersSent) {
        res.destroy();
        return;
    }
    const body = Buffer.from(String(message || 'Request failed') + '\n', 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function sendJson(res, statusCode, value) {
    const body = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

async function remuxAppleAac(outputPath, inputPath, tempDir) {
    const remuxed = path.join(tempDir, 'remuxed.m4a');
    // Ogg/Opus keep their tags on the audio stream. The MP4 muxer only reads
    // format-level tags in mdta mode, so repeat every user tag explicitly.
    const tags = await mediaTools.probeTags(inputPath);
    const args = [
        '-hide_banner', '-nostdin', '-v', 'error', '-y',
        '-i', outputPath,
        '-i', inputPath,
        '-map', '0:a:0',
        '-c:a', 'copy',
        '-map_metadata', '1',
        '-map_metadata:s:a:0', '1:s:a:0',
        '-map_chapters', '1',
        '-movflags', '+faststart+use_metadata_tags'
    ];
    args.push.apply(args, mediaTools.buildMetadataArgs(tags));
    args.push(remuxed);
    const result = await run(FFMPEG_BIN, args, { timeoutMs: JOB_TIMEOUT_MS });
    if (result.code !== 0 || !isFile(remuxed) || !fs.statSync(remuxed).size) {
        return false;
    }
    fs.renameSync(remuxed, outputPath);
    return true;
}

async function handleConvert(req, res, requestUrl) {
    let tempDir = null;
    try {
        refreshToolPaths();
        if (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN)) {
            throw new HttpError(503, 'FFmpeg is not available on the server at ' +
                FFMPEG_BIN + '. Restart the backend or set FFMPEG_BIN.');
        }

        await mediaTools.loadEncoders();

        const params = requestUrl.searchParams;
        const format = normalizeFormat(params.get('format'));
        const formatConfig = mediaTools.OUTPUT_FORMATS[format];
        if (!formatConfig) throw new HttpError(400, 'Unsupported output format: ' + format);

        const filename = sanitizeFilename(params.get('filename') || 'input');
        const ext = inputExtension(filename);
        const mode = normalizeMode(params.get('mode'));
        const bitrate = clampInteger(params.get('bitrate'), 6, 512, APPLE_AAC_DEFAULT_KBPS);
        let rate = clampInteger(params.get('rate'), 8000, 96000, 44100);
        const profile = normalizeProfile(params.get('profile'));
        const bitDepth = mediaTools.normalizeBitDepth(params.get('bitDepth'));

        if (format === 'AAC') {
            if (AAC_ENCODER === 'apple') {
                if (!aacState.ok) {
                    throw new HttpError(503, 'Apple AAC is not available. Verify qaac64.exe and CoreAudioToolbox.dll on the server.');
                }
                if (profile !== 'AACLC') {
                    throw new HttpError(400, 'Apple AAC currently supports AAC-LC only. Choose AAC-LC.');
                }
            } else {
                throw new HttpError(503, 'Only Apple AAC is supported for this conversion.');
            }
        }

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
        const inputPath = path.join(tempDir, 'input' + ext);
        const outputPath = path.join(tempDir, 'output.' + formatConfig.ext);
        const uploadedBytes = await readBodyToFile(req, inputPath, MAX_UPLOAD_BYTES);
        if (!uploadedBytes) throw new HttpError(400, 'Empty upload');

        const audioInfo = await probeAudioInfo(inputPath);
        const needsCover = formatConfig.artwork === 'mp4' ||
            formatConfig.artwork === 'vorbis-picture' ||
            formatConfig.artwork === 'id3' ||
            formatConfig.artwork === 'wav-id3';
        const cover = needsCover ? await mediaTools.findCoverArt(inputPath, tempDir) : null;

        let encoderLabel;
        let modeLabel = mode.toLowerCase();
        let outputRate = rate;

        if (format === 'AAC') {
            if (AAC_ENCODER === 'apple') {
                const decodeRate = Math.min(rate, 48000);
                outputRate = decodeRate;
                const wavPath = path.join(tempDir, 'decoded.wav');
                const decodeResult = await run(FFMPEG_BIN, buildDecodeArgs({
                    input: inputPath,
                    output: wavPath,
                    rate: decodeRate
                }), { timeoutMs: JOB_TIMEOUT_MS });
                if (decodeResult.code !== 0) {
                    const detail = String(decodeResult.stderr || decodeResult.stdout || '').trim();
                    throw new HttpError(500, 'FFmpeg decode failed: ' +
                        (detail || ('exit code ' + decodeResult.code)));
                }

                const decodedInfo = await probeAudioInfo(wavPath);
                const effectiveKbps = Math.min(
                    bitrate,
                    appleAacMaxKbps(decodedInfo.rate, decodedInfo.channels)
                );
                const qaacResult = await run(QAAC_BIN, buildQaacArgs({
                    input: wavPath,
                    output: outputPath,
                    mode: mode,
                    bitrate: effectiveKbps,
                    profile: profile
                }), {
                    timeoutMs: JOB_TIMEOUT_MS,
                    cwd: QAAC_CWD
                });
                if (qaacResult.code !== 0) {
                    const detail = String(qaacResult.stderr || qaacResult.stdout || '').trim();
                    throw new HttpError(500, 'Apple AAC encoder failed: ' +
                        (detail || ('exit code ' + qaacResult.code)));
                }

                // qaac writes a clean M4A without source metadata. Remux the
                // encoded audio with the original upload as the metadata,
                // chapters, and cover art. 
                const remuxedOk = await remuxAppleAac(outputPath, inputPath, tempDir);
                if (!remuxedOk) {
                    throw new HttpError(500, 'Could not preserve source metadata in the converted AAC file.');
                }
                if (cover && !mediaTools.injectMp4Cover(outputPath, cover)) {
                    throw new HttpError(500, 'Could not embed the source cover art in the converted AAC file.');
                }
                encoderLabel = 'apple';
                modeLabel = mode === 'VARIABLE'
                    ? 'tvbr-127'
                    : (mode === 'CONSTANT' ? 'cbr' : (mode === 'AVERAGE' ? 'abr' : 'cvbr'));
            }
        } else {
            if (format === 'OGG') {
                // The native Vorbis encoder in this FFmpeg build asserts when
                // it is fed decoded Vorbis frames at 44.1 kHz. Re-encoding
                // Ogg Vorbis to Ogg Vorbis at 48 kHz avoids that assertion.
                const streams = await mediaTools.probeStreams(inputPath);
                const audioStream = streams.find((stream) =>
                    stream && stream.codec_type === 'audio');
                if (audioStream && audioStream.codec_name === 'vorbis') {
                    rate = 48000;
                }
            }
            outputRate = format === 'OPUS' ? 48000 : rate;
            const args = await mediaTools.buildFormatArgs({
                input: inputPath,
                output: outputPath,
                format: format,
                mode: mode,
                bitrate: bitrate,
                rate: rate,
                bitDepth: bitDepth,
                channels: audioInfo.channels,
                flacCompression: params.get('flacCompression'),
                vorbisQuality: params.get('vorbisQuality'),
                opusQuality: params.get('opusQuality'),
                opusFrameDuration: params.get('opusFrameDuration'),
                opusApplication: params.get('opusApplication')
            });

            const result = await run(FFMPEG_BIN, args, { timeoutMs: JOB_TIMEOUT_MS });
            if (result.code !== 0) {
                const detail = String(result.stderr || result.stdout || '').trim();
                throw new HttpError(500, 'FFmpeg failed: ' +
                    (detail || ('exit code ' + result.code)));
            }

            if (formatConfig.artwork === 'mp4' && cover) {
                mediaTools.injectMp4Cover(outputPath, cover);
            } else if (formatConfig.artwork === 'vorbis-picture' && cover) {
                mediaTools.addOggPicture(outputPath, cover);
            } else if (formatConfig.artwork === 'id3') {
                const tags = await mediaTools.probeTags(inputPath);
                mediaTools.prependId3v2(outputPath, tags, cover);
            } else if (formatConfig.artwork === 'wav-id3') {
                const tags = await mediaTools.probeTags(inputPath);
                mediaTools.appendWavId3(outputPath, tags, cover);
            }

            encoderLabel = format.toLowerCase().replace(/_/g, '-');
        }

        const stat = fs.statSync(outputPath);
        if (!stat.size) throw new HttpError(500, 'Encoder produced an empty output file');

        const duration = await probeDuration(outputPath);
        let actualKbps = await probeStreamBitrateKbps(outputPath);
        if (!actualKbps && duration > 0) {
            actualKbps = Math.round(stat.size * 8 / duration / 1000);
        }

        const base = path.basename(filename, path.extname(filename)) || 'audio';
        const downloadName = base + '-' + encoderLabel + '.' + formatConfig.ext;
        res.writeHead(200, {
            'Content-Type': formatConfig.mime,
            'Content-Length': stat.size,
            'Content-Disposition': 'attachment; filename="' +
                downloadName.replace(/["\\]/g, '_') + '"',
            'X-Actual-Bitrate': String(actualKbps || ''),
            'X-Sample-Rate': String(outputRate),
            'X-Output-Format': format,
            'X-Encoder': encoderLabel,
            'X-AAC-Encoder': format === 'AAC' ? encoderLabel : '',
            'X-AAC-Mode': format === 'AAC' ? modeLabel : '',
            'Cache-Control': 'no-store'
        });

        await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(outputPath);
            stream.on('error', reject);
            res.on('close', resolve);
            res.on('finish', resolve);
            stream.pipe(res);
        });
    } catch (error) {
        const status = error instanceof HttpError ? error.statusCode : 500;
        if (!res.headersSent) {
            sendError(res, status, error && error.message ? error.message : String(error));
        } else {
            res.destroy();
        }
    } finally {
        if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
        }
    }
}

async function handleMetadata(req, res, requestUrl) {
    let tempDir = null;
    try {
        refreshToolPaths();
        if (path.isAbsolute(FFPROBE_BIN) && !isFile(FFPROBE_BIN)) {
            throw new HttpError(503, 'ffprobe is not available on the server at ' +
                FFPROBE_BIN + '. Restart the backend or set FFPROBE_BIN.');
        }

        const filename = sanitizeFilename(
            requestUrl.searchParams.get('filename') || 'output'
        );
        const ext = inputExtension(filename);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-metadata-'));
        const inputPath = path.join(tempDir, 'input' + ext);
        const uploadedBytes = await readBodyToFile(req, inputPath, MAX_UPLOAD_BYTES);
        if (!uploadedBytes) throw new HttpError(400, 'Empty upload');

        const metadata = await mediaTools.inspectMetadata(
            inputPath, filename, uploadedBytes
        );
        sendJson(res, 200, metadata);
    } catch (error) {
        const status = error instanceof HttpError ? error.statusCode : 500;
        if (!res.headersSent) {
            sendError(res, status, error && error.message ? error.message : String(error));
        } else {
            res.destroy();
        }
    } finally {
        if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
        }
    }
}

function parseMultipart(req, tempDir, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limit) {
                reject(new HttpError(413, 'Upload is larger than the configured limit'));
                req.resume();
                return;
            }
            chunks.push(chunk);
        });
        req.on('error', reject);
        req.on('aborted', () => reject(new HttpError(400, 'Upload aborted')));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const contentType = String(req.headers['content-type'] || '');
                const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
                const boundary = m ? (m[1] || m[2]) : null;
                if (!boundary) {
                    reject(new HttpError(400, 'Missing multipart boundary'));
                    return;
                }
                const delim = Buffer.from('--' + boundary);
                const fields = {};
                const files = {};
                let pos = buffer.indexOf(delim);
                if (pos === -1) {
                    reject(new HttpError(400, 'Invalid multipart body'));
                    return;
                }
                pos += delim.length;
                if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;
                while (true) {
                    const next = buffer.indexOf(delim, pos);
                    if (next === -1) break;
                    let partEnd = next;
                    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
                        partEnd -= 2;
                    }
                    const partBuffer = buffer.subarray(pos, partEnd);
                    const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
                    if (headerEnd !== -1) {
                        const headerStr = partBuffer.subarray(0, headerEnd).toString('utf8');
                        const body = partBuffer.subarray(headerEnd + 4);
                        const nameMatch = headerStr.match(/name="([^"]+)"/i);
                        const filenameMatch = headerStr.match(/filename="([^"]*)"/i);
                        const name = nameMatch ? nameMatch[1] : null;
                        if (name) {
                            if (filenameMatch && filenameMatch[1]) {
                                const original = path.basename(filenameMatch[1]);
                                const ext = path.extname(original) || '';
                                const target = path.join(tempDir, 'upload-' + name + ext);
                                fs.writeFileSync(target, body);
                                files[name] = target;
                            } else {
                                fields[name] = body.toString('utf8');
                            }
                        }
                    }
                    pos = next + delim.length;
                    if (pos + 1 < buffer.length && buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) {
                        break;
                    }
                    if (pos + 1 < buffer.length && buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) {
                        pos += 2;
                    }
                }
                resolve({ fields, files });
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function handleMetadataEdit(req, res, requestUrl) {
    let tempDir = null;
    try {
        refreshToolPaths();
        if (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN)) {
            throw new HttpError(503, 'FFmpeg is not available on the server at ' +
                FFMPEG_BIN + '. Restart the backend or set FFMPEG_BIN.');
        }

        const filename = sanitizeFilename(
            requestUrl.searchParams.get('filename') || 'output'
        );
        const ext = inputExtension(filename);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-metadata-edit-'));
        const inputPath = path.join(tempDir, 'input' + ext);
        const outputPath = path.join(tempDir, 'output' + ext);

        let tags = {};
        let coverPath = null;
        const contentType = String(req.headers['content-type'] || '');
        if (contentType.toLowerCase().includes('multipart/form-data')) {
            const parsed = await parseMultipart(req, tempDir, MAX_UPLOAD_BYTES + 10 * 1024 * 1024);
            if (parsed.files.file) {
                fs.copyFileSync(parsed.files.file, inputPath);
            } else if (parsed.files.audio) {
                fs.copyFileSync(parsed.files.audio, inputPath);
            } else {
                // fallback: first file
                const firstFile = Object.values(parsed.files)[0];
                if (firstFile) fs.copyFileSync(firstFile, inputPath);
            }
            if (parsed.files.cover) coverPath = parsed.files.cover;
            if (parsed.fields.tags) {
                try { tags = JSON.parse(parsed.fields.tags); } catch (e) { tags = {}; }
            }
            // also support individual fields
            for (const key of Object.keys(parsed.fields)) {
                if (key === 'tags') continue;
                if (parsed.fields[key] !== '') tags[key] = parsed.fields[key];
            }
        } else {
            const uploadedBytes = await readBodyToFile(req, inputPath, MAX_UPLOAD_BYTES);
            if (!uploadedBytes) throw new HttpError(400, 'Empty upload');
            const fields = {
                title: 'title', artist: 'artist', album: 'album',
                albumartist: 'album_artist', date: 'date', genre: 'genre',
                track: 'track', disc: 'disc', composer: 'composer',
                comment: 'comment', copyright: 'copyright'
            };
            for (const key of Object.keys(fields)) {
                const value = requestUrl.searchParams.get(key);
                if (value !== null && value !== '') tags[fields[key]] = value;
            }
        }
        if (!fs.existsSync(inputPath)) {
            throw new HttpError(400, 'No input file received');
        }

        const args = ['-hide_banner', '-nostdin', '-v', 'error', '-y'];
        if (coverPath) {
            args.push('-i', inputPath, '-i', coverPath);
            args.push('-map', '0:a', '-map', '1:v');
        } else {
            args.push('-i', inputPath);
            args.push('-map', '0');
        }
        args.push('-c', 'copy');
        if (coverPath) {
            args.push('-c:v', 'copy', '-disposition:v:0', 'attached_pic');
        }
        args.push('-map_metadata', '0');
        args.push.apply(args, mediaTools.buildMetadataArgs(tags));
        const lowerExt = String(ext || '').toLowerCase();
        if (lowerExt === '.m4a' || lowerExt === '.mp4' || lowerExt === '.m4b') {
            args.push('-movflags', '+faststart+use_metadata_tags');
        }
        args.push(outputPath);

        const result = await run(FFMPEG_BIN, args, { timeoutMs: JOB_TIMEOUT_MS });
        if (result.code !== 0 || !isFile(outputPath) || !fs.statSync(outputPath).size) {
            const detail = String(result.stderr || result.stdout || '').trim();
            throw new HttpError(500, 'Metadata edit failed: ' + (detail || ('exit code ' + result.code)));
        }

        const base = path.basename(filename, ext);
        const outName = sanitizeFilename(base + '-edited' + ext);
        const data = fs.readFileSync(outputPath);
        const mimeMap = {
            '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.m4b': 'audio/mp4',
            '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
            '.opus': 'audio/ogg', '.wav': 'audio/wav', '.aiff': 'audio/aiff',
            '.aif': 'audio/aiff', '.aac': 'audio/aac', '.wma': 'audio/x-ms-wma'
        };
        const mime = mimeMap[lowerExt] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': data.length,
            'Content-Disposition': 'attachment; filename="' + outName.replace(/["\\\\]/g, '_') + '"',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    } catch (error) {
        const status = error instanceof HttpError ? error.statusCode : 500;
        if (!res.headersSent) {
            sendError(res, status, error && error.message ? error.message : String(error));
        } else {
            res.destroy();
        }
    } finally {
        if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
        }
    }
}

async function serveStatic(req, res, pathname) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch (error) {
        sendError(res, 400, 'Invalid URL encoding');
        return;
    }

    if (decoded === '/' || decoded === '') decoded = '/index.html';
    if (decoded === '/server' || decoded.startsWith('/server/') ||
        decoded === '/scripts' || decoded.startsWith('/scripts/')) {
        sendError(res, 404, 'Not found');
        return;
    }
    if (decoded.split('/').some((part) => part.startsWith('.'))) {
        sendError(res, 404, 'Not found');
        return;
    }

    const filePath = path.resolve(STATIC_DIR, '.' + decoded);
    const relative = path.relative(STATIC_DIR, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        sendError(res, 403, 'Forbidden');
        return;
    }

    let stat;
    try {
        stat = await fs.promises.stat(filePath);
    } catch (error) {
        sendError(res, 404, 'Not found');
        return;
    }
    if (!stat.isFile()) {
        sendError(res, 404, 'Not found');
        return;
    }

    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=300'
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}

const server = http.createServer((req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let requestUrl;
    try {
        requestUrl = new URL(req.url, 'http://localhost');
    } catch (error) {
        sendError(res, 400, 'Invalid URL');
        return;
    }

    if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
        refreshToolPaths();
        const active = AAC_ENCODER === 'apple' ? aacState : fdkState;
        const ffmpegAvailable = isFile(FFMPEG_BIN) || !isPathLike(FFMPEG_BIN);
        const ffprobeAvailable = isFile(FFPROBE_BIN) || !isPathLike(FFPROBE_BIN);
        const healthy = active.ok && ffmpegAvailable && ffprobeAvailable;
        const binaryError = !ffmpegAvailable
            ? 'FFmpeg was not found at ' + FFMPEG_BIN + '. Set FFMPEG_BIN or place ffmpeg in ffmpeg-fdk/bin.'
            : (!ffprobeAvailable
                ? 'ffprobe was not found at ' + FFPROBE_BIN + '. Set FFPROBE_BIN or place ffprobe next to ffmpeg.'
                : null);
        const health = {
            ok: healthy,
            encoder: AAC_ENCODER === 'apple' ? 'apple-aac' : 'fdk-aac',
            ffmpeg: FFMPEG_BIN,
            ffprobe: FFPROBE_BIN,
            ffmpegAvailable: ffmpegAvailable,
            ffprobeAvailable: ffprobeAvailable,
            host: HOST,
            port: PORT,
            platform: process.platform,
            checkedAt: active.checkedAt,
            error: active.error || binaryError,
            defaultBitrate: APPLE_AAC_DEFAULT_KBPS,
            formats: Object.keys(mediaTools.OUTPUT_FORMATS)
        };
        if (AAC_ENCODER === 'apple') {
            health.qaac = QAAC_BIN;
            health.qaacVersion = aacState.version;
            health.coreAudioToolbox = aacState.coreAudioToolbox;
            health.rateControl = {
                CBR: 'qaac --cbr 320',
                ABR: 'qaac --abr 320',
                CVBR: 'qaac --cvbr 320',
                VBR: 'qaac --tvbr 127 (quality-based; actual bitrate is reported)'
            };
        } else {
            health.fdkRegistered = fdkState.registered;
            health.fdkEncoder = fdkState.encoder;
            health.nonfree = true;
            health.rateControl = {
                CBR: 'libfdk_aac -vbr 0 -b:a',
                ABR: 'mapped to CBR (libfdk_aac has no native ABR switch)',
                CVBR: 'mapped to CBR (libfdk_aac has no native CVBR switch)',
                VBR: 'libfdk_aac -vbr 5'
            };
        }
        sendJson(res, healthy ? 200 : 503, health);
        return;
    }

    if (requestUrl.pathname === '/api/convert' && req.method === 'POST') {
        handleConvert(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname === '/api/metadata' && req.method === 'POST') {
        handleMetadata(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname === '/api/metadata/edit' && req.method === 'POST') {
        handleMetadataEdit(req, res, requestUrl);
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, requestUrl.pathname).catch((error) => {
            sendError(res, 500, error && error.message ? error.message : String(error));
        });
        return;
    }

    sendError(res, 405, 'Method not allowed');
});

async function start() {
    await mediaTools.loadEncoders();
    if (SKIP_AAC_CHECK) {
        if (AAC_ENCODER === 'apple') {
            aacState = {
                ok: false,
                encoder: 'apple-aac',
                qaac: QAAC_BIN,
                version: null,
                coreAudioToolbox: null,
                checkedAt: new Date().toISOString(),
                error: 'AAC check skipped (SKIP_AAC_CHECK=1)'
            };
        } else {
            fdkState = {
                ok: false,
                registered: false,
                encoder: false,
                checkedAt: new Date().toISOString(),
                error: 'FDK check skipped (SKIP_AAC_CHECK=1)'
            };
        }
        console.warn('WARNING: SKIP_AAC_CHECK=1; AAC requests will return 503, ' +
            'but non-AAC formats will still convert.');
    } else if (AAC_ENCODER === 'apple') {
        aacState = await verifyAppleAac();
        if (!aacState.ok) {
            console.error('ERROR: Apple AAC verification failed: ' + aacState.error);
            console.error('Starting in degraded mode so the API can report the problem.');
            console.error('Install qaac64.exe with Apple CoreAudioToolbox.dll, then restart this process.');
            console.error('AAC requests will return 503 until then; non-AAC formats still convert.');
        } else {
            console.log('OK: Apple AAC (qaac + CoreAudioToolbox) is available.');
        }
    } else {
        fdkState = await verifyFdk();
        if (!fdkState.ok) {
            console.error('ERROR: libfdk_aac verification failed: ' + fdkState.error);
            console.error('Starting in degraded mode so the API can report the problem.');
            console.error('Run scripts/verify-fdk.sh on the server, then restart this process.');
            console.error('/api/health and /api/convert will return 503 until then.');
        } else {
            console.log('OK: libfdk_aac is registered and the encoder is available.');
        }
    }

    server.listen(PORT, HOST, () => {
        console.log('Audio conversion server listening on http://' + HOST + ':' + PORT);
        console.log('Static site: ' + STATIC_DIR);
        console.log('AAC encoder: ' + (AAC_ENCODER === 'apple'
            ? 'Apple CoreAudio (qaac)'
            : 'Fraunhofer FDK (libfdk_aac)'));
        console.log('FFmpeg: ' + FFMPEG_BIN +
            (path.isAbsolute(FFMPEG_BIN) && !isFile(FFMPEG_BIN) ? ' (MISSING)' : ''));
        console.log('ffprobe: ' + FFPROBE_BIN +
            (path.isAbsolute(FFPROBE_BIN) && !isFile(FFPROBE_BIN) ? ' (MISSING)' : ''));
        if (AAC_ENCODER === 'apple') {
            console.log('qaac: ' + QAAC_BIN);
            console.log('CoreAudioToolbox: ' + (aacState.coreAudioToolbox || 'unknown'));
            console.log('NOTE: Apple CoreAudioToolbox is proprietary; keep it server-side.');
        } else {
            console.log('NOTE: this is a --enable-nonfree build; keep the binary server-side.');
        }
    });
}

if (require.main === module) {
    start().catch((error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exit(1);
    });
}

module.exports = {
    buildAacArgs,
    buildDecodeArgs,
    buildQaacArgs,
    appleAacMaxKbps,
    normalizeMode,
    normalizeProfile,
    sanitizeFilename,
    readBodyToFile,
    verifyFdk,
    verifyAppleAac,
    server,
    start
};
