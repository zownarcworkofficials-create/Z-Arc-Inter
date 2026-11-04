'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
    buildAacArgs,
    buildDecodeArgs,
    buildQaacArgs,
    appleAacMaxKbps,
    normalizeMode,
    normalizeProfile,
    sanitizeFilename,
    readBodyToFile
} = require('./index');
const { createMediaTools } = require('./media-tools');

class TestHttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

function testClampInteger(value, min, max, fallback) {
    const number = parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

const formatTools = createMediaTools({
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    ffmpegBin: 'ffmpeg',
    ffprobeBin: 'ffprobe',
    HttpError: TestHttpError,
    clampInteger: testClampInteger
});

const vbr = buildAacArgs({
    input: 'input.flac',
    output: 'output.m4a',
    mode: 'VARIABLE',
    bitrate: 224,
    rate: 44100,
    profile: 'AACLC'
}).join(' ');
assert(vbr.includes('-c:a libfdk_aac'), 'VBR must use libfdk_aac');
assert(vbr.includes('-vbr 5'), 'VBR must use -vbr 5');
assert(!vbr.includes('-b:a'), 'VBR must not pass -b:a');
assert(vbr.includes('-profile:a aac_low'), 'VBR must use AAC-LC');

const cbr = buildAacArgs({
    input: 'input.flac',
    output: 'output.m4a',
    mode: 'CONSTANT',
    bitrate: 192,
    rate: 48000,
    profile: 'AACLC'
}).join(' ');
assert(cbr.includes('-vbr 0'), 'CBR must disable FDK VBR');
assert(cbr.includes('-b:a 192k'), 'CBR must pass the requested bitrate');
assert(cbr.includes('-map_metadata 0'), 'AAC output must copy all source metadata');
assert(cbr.includes('+faststart+use_metadata_tags'),
    'AAC output must keep custom MP4 metadata keys');

const cbrMeta = buildAacArgs({
    input: 'input.flac',
    output: 'output.m4a',
    mode: 'CONSTANT',
    bitrate: 192,
    rate: 48000,
    profile: 'AACLC',
    metadataArgs: ['-metadata', 'CUSTOM_KEY=custom value']
}).join(' ');
assert(cbrMeta.includes('-metadata CUSTOM_KEY=custom value'),
    'FDK AAC must receive explicit stream-derived tags');

for (const mode of ['AVERAGE', 'CONSTRAINED']) {
    const args = buildAacArgs({
        input: 'input.flac',
        output: 'output.m4a',
        mode,
        bitrate: 128,
        rate: 44100,
        profile: 'AACLC'
    }).join(' ');
    assert(args.includes('-vbr 0'), mode + ' is mapped to FDK CBR');
    assert(args.includes('-b:a 128k'), mode + ' must keep the bitrate target');
}

assert.throws(() => {
    buildAacArgs({
        input: 'input.flac',
        output: 'output.m4a',
        mode: 'VARIABLE',
        bitrate: 128,
        rate: 44100,
        profile: 'AACHE'
    });
}, /only available for AAC-LC/);

const decode = buildDecodeArgs({
    input: 'input.flac',
    output: 'decoded.wav',
    rate: 44100
}).join(' ');
assert(decode.includes('-c:a pcm_s24le'), 'Apple AAC path must decode to 24-bit WAV');
assert(decode.includes('-map 0:a:0'), 'Apple AAC path must select the first audio stream');

const appleCbr = buildQaacArgs({
    input: 'decoded.wav',
    output: 'output.m4a',
    mode: 'CONSTANT',
    bitrate: 320,
    profile: 'AACLC'
}).join(' ');
assert(appleCbr.includes('--cbr 320'), 'Apple CBR must pass 320 kbps');
assert(appleCbr.includes('--quality 2'), 'Apple AAC must use the highest encoder quality');
assert(appleCbr.includes('--no-optimize'), 'Apple AAC must keep the fast MP4 path');

const appleAbr = buildQaacArgs({
    input: 'decoded.wav',
    output: 'output.m4a',
    mode: 'AVERAGE',
    bitrate: 320,
    profile: 'AACLC'
}).join(' ');
assert(appleAbr.includes('--abr 320'), 'Apple ABR must pass 320 kbps');

const appleCvbr = buildQaacArgs({
    input: 'decoded.wav',
    output: 'output.m4a',
    mode: 'CONSTRAINED',
    bitrate: 320,
    profile: 'AACLC'
}).join(' ');
assert(appleCvbr.includes('--cvbr 320'), 'Apple CVBR must pass 320 kbps');

const appleTvbr = buildQaacArgs({
    input: 'decoded.wav',
    output: 'output.m4a',
    mode: 'VARIABLE',
    bitrate: 320,
    profile: 'AACLC'
}).join(' ');
assert(appleTvbr.includes('--tvbr 127'), 'Apple VBR must use the highest true-VBR quality');

assert.throws(() => {
    buildQaacArgs({
        input: 'decoded.wav',
        output: 'output.m4a',
        mode: 'CONSTANT',
        bitrate: 320,
        profile: 'AACHE'
    });
}, /supports AAC-LC only/);

assert.strictEqual(appleAacMaxKbps(44100, 2), 320, 'Apple stereo 44.1 kHz must allow 320');
assert.strictEqual(appleAacMaxKbps(48000, 2), 320, 'Apple stereo 48 kHz must allow 320');
assert.strictEqual(appleAacMaxKbps(44100, 1), 256, 'Apple mono 44.1 kHz is capped at 256');

assert.strictEqual(normalizeProfile('he-aac'), 'AACHE');
assert.strictEqual(normalizeProfile('he-aac-v2'), 'AACHEV2');
assert.strictEqual(normalizeProfile('aac_eld'), 'AACELD');
assert.strictEqual(normalizeMode('vbr'), 'VARIABLE');
assert(!/[\\/]/.test(sanitizeFilename('../../evil.flac')), 'filename must not contain path separators');

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdk-backend-test-'));
    try {
        const file = path.join(dir, 'upload.bin');
        const req = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
        req.headers = { 'content-length': '11' };
        const total = await readBodyToFile(req, file, 100);
        assert.strictEqual(total, 11);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello world');

        const tooBig = path.join(dir, 'too-big.bin');
        const req2 = Readable.from([Buffer.alloc(200, 1)]);
        req2.headers = { 'content-length': '200' };
        await assert.rejects(
            () => readBodyToFile(req2, tooBig, 100),
            /larger than the configured limit/
        );

        const base = {
            input: 'input.flac',
            output: 'output.bin',
            mode: 'VARIABLE',
            bitrate: 192,
            rate: 44100,
            bitDepth: '24',
            channels: 1
        };

        const metadataArgs = formatTools.buildMetadataArgs({
            title: 'Title',
            CUSTOM_KEY: 'custom value',
            encoder: 'Lavf',
            METADATA_BLOCK_PICTURE: 'large-base64'
        });
        assert(metadataArgs.includes('-metadata'));
        assert(metadataArgs.includes('title=Title'));
        assert(metadataArgs.includes('CUSTOM_KEY=custom value'));
        assert(!metadataArgs.includes('encoder=Lavf'),
            'technical tags must not be copied as user metadata');
        assert(!metadataArgs.some((item) => item.startsWith('METADATA_BLOCK_PICTURE=')),
            'picture comments must not be passed on the command line');

        const flacArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'FLAC', output: 'output.flac'
        })).join(' ');
        assert(flacArgs.includes('-map_metadata 0'), 'FLAC must copy all metadata');
        assert(flacArgs.includes('-map_metadata:s:a:0 0:s:a:0'),
            'FLAC must copy audio-stream metadata');
        assert(flacArgs.includes('-map 0:v?'), 'FLAC must map attached pictures');
        assert(flacArgs.includes('-disposition:v attached_pic'),
            'FLAC must mark copied images as attached pictures');

        const wavArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'WAV', output: 'output.wav'
        })).join(' ');
        assert(wavArgs.includes('-map_metadata 0'), 'WAV must copy text metadata');
        assert(!wavArgs.includes('-map 0:v?'),
            'WAV must not map a video stream into the WAV muxer');
        assert.strictEqual(typeof formatTools.appendWavId3, 'function',
            'WAV artwork/tags must be written through an ID3 chunk');

        const aiffArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'AIFF', output: 'output.aiff'
        })).join(' ');
        assert(aiffArgs.includes('-map 0:v?'),
            'AIFF must map attached pictures into its ID3 chunk');
        assert(aiffArgs.includes('-write_id3v2 1'),
            'AIFF must write ID3v2 tags');

        const mp3Args = (await formatTools.buildFormatArgs({
            ...base, format: 'MP3', output: 'output.mp3'
        })).join(' ');
        assert(mp3Args.includes('-id3v2_version 3'), 'MP3 must write ID3v2.3');
        assert(mp3Args.includes('-disposition:v attached_pic'),
            'MP3 must embed attached pictures');

        const m4aArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'ALAC', output: 'output.m4a'
        })).join(' ');
        assert(m4aArgs.includes('+faststart+use_metadata_tags'),
            'MP4/ALAC must preserve custom metadata keys');

        const oggArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'OGG', output: 'output.ogg'
        })).join(' ');
        assert(!oggArgs.includes('METADATA_BLOCK_PICTURE'),
            'Ogg artwork must be written after muxing, not passed on the command line');
        assert(oggArgs.includes('-ac 2'),
            'native Vorbis must be fed stereo for mono sources');
        assert.strictEqual(typeof formatTools.addOggPicture, 'function',
            'Ogg artwork writer must be available');

        const opusArgs = (await formatTools.buildFormatArgs({
            ...base, format: 'OPUS', output: 'output.opus', rate: 44100
        })).join(' ');
        assert(opusArgs.includes('-ar 48000'),
            'Opus must be resampled to its supported 48 kHz rate');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }

    console.log('OK: backend argument tests passed.');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
