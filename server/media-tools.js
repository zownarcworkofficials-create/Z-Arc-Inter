'use strict';

/*
 * Format-aware FFmpeg helpers for the conversion backend.
 *
 * Metadata rules:
 *   - Every output gets `-map_metadata 0` and the audio stream metadata is
 *     copied as well.
 *   - FLAC, MP3, and AIFF copy attached-picture streams directly.
 *   - MP4/M4A (AAC, ALAC) uses use_metadata_tags for custom keys, then the
 *     cover is injected into the iTunes `covr` atom afterwards. FFmpeg's
 *     mdta muxing mode otherwise drops cover art.
 *   - Ogg/Opus receives a FLAC picture block as a Vorbis comment
 *     (METADATA_BLOCK_PICTURE), inserted into the comment packet after muxing.
 *   - MP2 gets a proper ID3v2.3 tag (including custom TXXX frames and APIC)
 *     because FFmpeg's MP2 muxer has no tag writer of its own.
 *   - WAV/ADPCM get an appended ID3v2 chunk (custom TXXX + APIC); AIFF writes
 *     ID3v2 including APIC through its muxer.
 *   - AC3, WavPack, and WMA have no usable picture tag in this FFmpeg build;
 *     they keep text tags where the muxer allows them and skip artwork.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OUTPUT_FORMATS = {
    WAV: {
        ext: 'wav', mime: 'audio/wav', artwork: 'wav-id3', codec: 'pcm'
    },
    FLAC: {
        ext: 'flac', mime: 'audio/flac', artwork: 'stream', codec: 'flac'
    },
    MP3: {
        ext: 'mp3', mime: 'audio/mpeg', artwork: 'stream',
        codecCandidates: ['libmp3lame', 'mp3_mf', 'libshine'], id3: true
    },
    AAC: {
        ext: 'm4a', mime: 'audio/mp4', artwork: 'mp4', codec: 'aac', mov: true
    },
    OGG: {
        ext: 'ogg', mime: 'audio/ogg', artwork: 'vorbis-picture',
        codecCandidates: ['libvorbis', 'vorbis'], strict: true
    },
    AIFF: {
        ext: 'aiff', mime: 'audio/aiff', artwork: 'stream', codec: 'pcm',
        aiffId3: true
    },
    ALAC: {
        ext: 'm4a', mime: 'audio/mp4', artwork: 'mp4', codec: 'alac', mov: true
    },
    OPUS: {
        ext: 'opus', mime: 'audio/ogg', artwork: 'vorbis-picture',
        codecCandidates: ['libopus', 'opus'], strict: true
    },
    AC3: {
        ext: 'ac3', mime: 'audio/ac3', artwork: 'none', codec: 'ac3'
    },
    WAVPACK: {
        ext: 'wv', mime: 'audio/x-wavpack', artwork: 'none', codec: 'wavpack'
    },
    WMA: {
        ext: 'wma', mime: 'audio/x-ms-wma', artwork: 'none', codec: 'wmav2'
    },
    MP2: {
        ext: 'mp2', mime: 'audio/mpeg', artwork: 'id3', codec: 'mp2'
    },
    IMA_ADPCM: {
        ext: 'wav', mime: 'audio/wav', artwork: 'wav-id3', codec: 'adpcm_ima_wav'
    },
    MS_ADPCM: {
        ext: 'wav', mime: 'audio/wav', artwork: 'wav-id3', codec: 'adpcm_ms'
    }
};

const FORMAT_ALIASES = {
    OGG_VORBIS: 'OGG',
    VORBIS: 'OGG',
    OGA: 'OGG',
    IMA: 'IMA_ADPCM',
    IMAADPCM: 'IMA_ADPCM',
    IMA_ADPCM_WAV: 'IMA_ADPCM',
    MS: 'MS_ADPCM',
    MSADPCM: 'MS_ADPCM',
    MS_ADPCM_WAV: 'MS_ADPCM',
    WAVPACK: 'WAVPACK',
    WV: 'WAVPACK'
};

const BIT_DEPTHS = ['8', '16', '24', '32', '32f', '64f'];

const TECHNICAL_TAGS = new Set([
    'handler_name', 'vendor_id', 'language', 'duration', 'creation_time',
    'encoder', 'major_brand', 'minor_version', 'compatible_brands',
    'media_type', 'codec_name', 'codec_type', 'nb_frames', 'filename',
    'mimetype'
]);

function isTechnicalTag(key) {
    const lower = String(key || '').toLowerCase();
    if (TECHNICAL_TAGS.has(lower)) return true;
    return lower.startsWith('metadata_block_picture') || lower === 'coverart';
}

function normalizeFormat(value) {
    const raw = String(value || 'AAC').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (FORMAT_ALIASES[raw]) return FORMAT_ALIASES[raw];
    return OUTPUT_FORMATS[raw] ? raw : 'AAC';
}

function normalizeBitDepth(value) {
    const raw = String(value || '24').trim().toLowerCase();
    return BIT_DEPTHS.indexOf(raw) !== -1 ? raw : '24';
}

function mimeFor(cover) {
    if (!cover) return 'image/jpeg';
    return cover.mime || 'image/jpeg';
}

function pictureTypeFor(cover) {
    const mime = mimeFor(cover);
    if (mime === 'image/png') return 14;
    if (mime === 'image/bmp') return 27;
    return 13;
}

const OGG_CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index << 24;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 0x80000000)
                ? ((value << 1) ^ 0x04c11db7)
                : (value << 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function oggChecksum(buffer) {
    let crc = 0;
    for (let index = 0; index < buffer.length; index++) {
        crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ buffer[index]) & 0xff]) >>> 0;
    }
    return crc >>> 0;
}

function createMediaTools(options) {
    const run = options.run;
    const HttpError = options.HttpError;
    const clampInteger = options.clampInteger;
    const ffmpegBin = options.ffmpegBin;
    const ffprobeBin = options.ffprobeBin;
    const timeoutMs = options.timeoutMs || (() => 15 * 60 * 1000);

    let availableEncoders = null;
    let encoderLoadPromise = null;

    function ffmpeg() {
        return typeof ffmpegBin === 'function' ? ffmpegBin() : ffmpegBin;
    }

    function ffprobe() {
        return typeof ffprobeBin === 'function' ? ffprobeBin() : ffprobeBin;
    }

    async function loadEncoders() {
        if (availableEncoders) return availableEncoders;
        if (encoderLoadPromise) return encoderLoadPromise;
        encoderLoadPromise = (async () => {
            const found = new Set();
            try {
                const result = await run(ffmpeg(), ['-hide_banner', '-encoders'], {
                    timeoutMs: 20000
                });
                const text = String(result.stdout || '') + String(result.stderr || '');
                const lines = text.split(/\r?\n/);
                for (const line of lines) {
                    const match = /^\s*[A-Z.]{6}\s+(\S+)/.exec(line);
                    if (match) found.add(match[1]);
                }
            } catch (error) {
                // Leave the set empty; candidates will be tried in order.
            }
            availableEncoders = found;
            encoderLoadPromise = null;
            return found;
        })();
        return encoderLoadPromise;
    }

    function chooseEncoder(candidates) {
        if (availableEncoders && availableEncoders.size) {
            for (const name of candidates) {
                if (availableEncoders.has(name)) return name;
            }
            return null;
        }
        return candidates[0];
    }

    async function probeStreams(file) {
        try {
            const result = await run(ffprobe(), [
                '-v', 'error',
                '-show_entries',
                'stream=index,codec_type,codec_name,width,height:stream_disposition=attached_pic',
                '-of', 'json',
                file
            ], { timeoutMs: 20000 });
            const parsed = JSON.parse(String(result.stdout || '{}'));
            return Array.isArray(parsed.streams) ? parsed.streams : [];
        } catch (error) {
            return [];
        }
    }

    async function probeTags(file) {
        try {
            const result = await run(ffprobe(), [
                '-v', 'error',
                '-show_entries', 'format_tags:stream=codec_type:stream_tags',
                '-of', 'json',
                file
            ], { timeoutMs: 20000 });
            const parsed = JSON.parse(String(result.stdout || '{}'));
            const tags = Object.assign({},
                parsed.format && parsed.format.tags ? parsed.format.tags : {});
            for (const stream of parsed.streams || []) {
                if (stream.codec_type !== 'audio') continue;
                for (const key of Object.keys(stream.tags || {})) {
                    if (isTechnicalTag(key)) continue;
                    if (tags[key] === undefined) tags[key] = stream.tags[key];
                }
            }
            return tags;
        } catch (error) {
            return {};
        }
    }

    function buildMetadataArgs(tags) {
        const args = [];
        for (const key of Object.keys(tags || {})) {
            const value = tags[key];
            if (value === undefined || value === null || value === '') continue;
            if (isTechnicalTag(key)) continue;
            args.push('-metadata', key + '=' + String(value));
        }
        return args;
    }

    function metadataText(value) {
        if (value === undefined || value === null) return '';
        const text = String(value);
        return text.length > 8192 ? text.slice(0, 8192) + '…' : text;
    }

    async function inspectMetadata(file, displayName, size) {
        const result = await run(ffprobe(), [
            '-v', 'error',
            '-show_format',
            '-show_streams',
            '-show_chapters',
            '-of', 'json',
            file
        ], { timeoutMs: 30000 });
        if (result.code !== 0) {
            const detail = String(result.stderr || result.stdout || '').trim();
            throw new HttpError(400, 'Could not read metadata: ' +
                (detail || ('ffprobe exit code ' + result.code)));
        }

        const parsed = JSON.parse(String(result.stdout || '{}'));
        const format = parsed.format || {};
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const audio = streams.find((stream) =>
            stream && stream.codec_type === 'audio') || null;
        const picture = streams.find((stream) =>
            stream &&
            stream.codec_type === 'video' &&
            stream.disposition &&
            Number(stream.disposition.attached_pic) === 1) || null;

        // Extract embedded cover art (if any) so the editor can preview it.
        let coverData = null;
        let coverMime = 'image/jpeg';
        if (picture) {
            coverMime = picture.codec_name === 'png' ? 'image/png' :
                (picture.codec_name === 'bmp' ? 'image/bmp' : 'image/jpeg');
            const coverPath = path.join(os.tmpdir(),
                'cover-' + Date.now() + '-' + Math.random().toString(36).slice(2) +
                (coverMime === 'image/png' ? '.png' : '.jpg'));
            const extractResult = await run(ffmpeg(), [
                '-hide_banner', '-nostdin', '-v', 'error', '-y',
                '-i', file,
                '-map', '0:v:0',
                '-frames:v', '1',
                coverPath
            ], { timeoutMs: 20000 });
            if (extractResult.code === 0 && fs.existsSync(coverPath)) {
                try {
                    coverData = fs.readFileSync(coverPath).toString('base64');
                } catch (error) { /* ignore */ }
            }
            try { fs.unlinkSync(coverPath); } catch (error) { /* ignore */ }
        }

        const tags = {};
        const seen = new Set();
        const addTags = (source) => {
            for (const key of Object.keys(source || {})) {
                const value = source[key];
                if (value === undefined || value === null || value === '') continue;
                if (isTechnicalTag(key)) continue;
                const lower = key.toLowerCase();
                if (seen.has(lower)) continue;
                seen.add(lower);
                tags[key] = metadataText(value);
            }
        };
        addTags(format.tags);
        for (const stream of streams) {
            if (stream.codec_type !== 'audio') continue;
            addTags(stream.tags);
        }

        const duration = Number(format.duration) ||
            Number(audio && audio.duration) || 0;
        const overallBitrate = Number(format.bit_rate) ||
            (duration > 0 ? Math.round(size * 8 / duration) : 0);
        const audioBitrate = Number(audio && audio.bit_rate) || overallBitrate;
        const encoder = metadataText(
            (format.tags && format.tags.encoder) ||
            (audio && audio.tags && audio.tags.encoder) || ''
        );

        return {
            file: {
                name: displayName,
                size: Number(size) || 0,
                container: format.format_name || '',
                formatLong: format.format_long_name || '',
                duration: duration,
                bitrate: overallBitrate,
                encoder: encoder
            },
            audio: audio ? {
                codec: audio.codec_name || '',
                codecLongName: audio.codec_long_name || '',
                profile: audio.profile || '',
                sampleRate: Number(audio.sample_rate) || 0,
                channels: Number(audio.channels) || 0,
                channelLayout: audio.channel_layout || '',
                bitrate: audioBitrate,
                bitsPerSample: Number(audio.bits_per_sample ||
                    audio.bits_per_raw_sample) || 0
            } : null,
            artwork: picture ? {
                codec: picture.codec_name || '',
                codecLongName: picture.codec_long_name || '',
                width: Number(picture.width) || 0,
                height: Number(picture.height) || 0,
                data: coverData,
                mime: coverMime
            } : null,
            tags: tags,
            chapters: (parsed.chapters || []).map((chapter, index) => ({
                title: metadataText(
                    chapter.tags && chapter.tags.title
                        ? chapter.tags.title
                        : 'Chapter ' + (index + 1)
                ),
                start: Number(chapter.start_time) || 0,
                end: Number(chapter.end_time) || 0
            }))
        };
    }

    async function findCoverArt(inputPath, tempDir) {
        const streams = await probeStreams(inputPath);
        const picture = streams.find((stream) =>
            stream &&
            stream.codec_type === 'video' &&
            stream.disposition &&
            Number(stream.disposition.attached_pic) === 1
        );
        if (!picture) return null;

        const codec = String(picture.codec_name || 'mjpeg').toLowerCase();
        const directCopy = ['mjpeg', 'jpeg', 'png', 'bmp'].includes(codec);
        const ext = directCopy
            ? (codec === 'png' ? '.png' : (codec === 'bmp' ? '.bmp' : '.jpg'))
            : '.png';
        const mime = directCopy
            ? (codec === 'png'
                ? 'image/png'
                : (codec === 'bmp' ? 'image/bmp' : 'image/jpeg'))
            : 'image/png';
        const output = path.join(tempDir, 'cover-' + picture.index + ext);

        const args = [
            '-hide_banner', '-nostdin', '-v', 'error', '-y',
            '-i', inputPath,
            '-map', '0:' + picture.index,
            '-frames:v', '1',
            '-c:v', directCopy ? 'copy' : 'png',
            output
        ];
        let result = await run(ffmpeg(), args, { timeoutMs: 30000 });
        if (result.code !== 0 || !fs.existsSync(output) || !fs.statSync(output).size) {
            const fallbackCodec = ext === '.png' ? 'png' : (ext === '.bmp' ? 'bmp' : 'mjpeg');
            result = await run(ffmpeg(), [
                '-hide_banner', '-nostdin', '-v', 'error', '-y',
                '-i', inputPath,
                '-map', '0:' + picture.index,
                '-frames:v', '1',
                '-c:v', fallbackCodec,
                output
            ], { timeoutMs: 30000 });
        }
        if (result.code !== 0 || !fs.existsSync(output) || !fs.statSync(output).size) {
            return null;
        }

        return {
            path: output,
            mime: mime,
            width: Number(picture.width) || 0,
            height: Number(picture.height) || 0,
            ext: ext
        };
    }

    function u32(value) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value >>> 0, 0);
        return buffer;
    }

    function u32le(value) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(value >>> 0, 0);
        return buffer;
    }

    function buildVorbisPictureBlock(cover) {
        if (!cover) return null;
        const data = fs.readFileSync(cover.path);
        const mime = Buffer.from(mimeFor(cover), 'utf8');
        const description = Buffer.alloc(0);
        const block = Buffer.concat([
            u32(3),
            u32(mime.length), mime,
            u32(description.length), description,
            u32(cover.width || 0),
            u32(cover.height || 0),
            u32(24),
            u32(0),
            u32(data.length), data
        ]);
        return block.toString('base64');
    }

    function parseOggPages(buffer) {
        const pages = [];
        let offset = 0;
        while (offset + 27 <= buffer.length) {
            if (buffer.toString('latin1', offset, offset + 4) !== 'OggS') break;
            if (buffer[offset + 4] !== 0) break;
            const headerType = buffer[offset + 5];
            const granule = buffer.readBigInt64LE(offset + 6);
            const serial = buffer.readUInt32LE(offset + 14);
            const sequence = buffer.readUInt32LE(offset + 18);
            const segmentCount = buffer[offset + 26];
            const lacingStart = offset + 27;
            if (lacingStart + segmentCount > buffer.length) break;
            const lacing = Buffer.from(buffer.subarray(lacingStart, lacingStart + segmentCount));
            let payloadSize = 0;
            for (let index = 0; index < lacing.length; index++) payloadSize += lacing[index];
            const payloadStart = lacingStart + segmentCount;
            const end = payloadStart + payloadSize;
            if (end > buffer.length) break;
            pages.push({
                offset: offset,
                end: end,
                headerType: headerType,
                granule: granule,
                serial: serial,
                sequence: sequence,
                lacing: lacing,
                payload: buffer.subarray(payloadStart, end)
            });
            offset = end;
        }
        return pages;
    }

    function buildOggPage(serial, sequence, headerType, granule, lacing, payload) {
        const header = Buffer.alloc(27 + lacing.length);
        header.write('OggS', 0, 'latin1');
        header[4] = 0;
        header[5] = headerType;
        header.writeBigInt64LE(BigInt(granule), 6);
        header.writeUInt32LE(serial >>> 0, 14);
        header.writeUInt32LE(sequence >>> 0, 18);
        header.writeUInt32LE(0, 22);
        header[26] = lacing.length;
        Buffer.from(lacing).copy(header, 27);
        const page = Buffer.concat([header, payload]);
        page.writeUInt32LE(oggChecksum(page), 22);
        return page;
    }

    function packetsForSerial(pages, serial) {
        const packets = [];
        let chunks = [];
        let startPage = -1;
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
            const page = pages[pageIndex];
            if (page.serial !== serial) continue;
            let payloadOffset = 0;
            for (let index = 0; index < page.lacing.length; index++) {
                const length = page.lacing[index];
                if (startPage === -1) startPage = pageIndex;
                chunks.push(page.payload.subarray(payloadOffset, payloadOffset + length));
                payloadOffset += length;
                if (length < 255) {
                    packets.push({
                        data: Buffer.concat(chunks),
                        startPage: startPage,
                        endPage: pageIndex
                    });
                    chunks = [];
                    startPage = -1;
                }
            }
        }
        return packets;
    }

    function paginateOggPacket(packet, serial, startSequence, bos) {
        const lacing = [];
        let remaining = packet.length;
        if (remaining === 0) lacing.push(0);
        while (remaining > 0) {
            const take = Math.min(255, remaining);
            lacing.push(take);
            remaining -= take;
        }
        if (lacing[lacing.length - 1] === 255) lacing.push(0);

        const pages = [];
        let sequence = startSequence;
        let offset = 0;
        let firstPage = true;
        for (let index = 0; index < lacing.length; index += 255) {
            const pageLacing = lacing.slice(index, index + 255);
            let payloadSize = 0;
            for (const value of pageLacing) payloadSize += value;
            const payload = packet.subarray(offset, offset + payloadSize);
            offset += payloadSize;
            let headerType = 0;
            if (firstPage && bos) headerType |= 0x02;
            if (!firstPage) headerType |= 0x01;
            pages.push(buildOggPage(serial, sequence, headerType, 0n,
                pageLacing, payload));
            sequence++;
            firstPage = false;
        }
        return pages;
    }

    function parseOggComment(packet, codec) {
        let offset = codec === 'vorbis' ? 7 : 8;
        if (offset > packet.length) return null;
        const vendorLength = packet.readUInt32LE(offset);
        offset += 4;
        if (offset + vendorLength > packet.length) return null;
        const vendor = packet.subarray(offset, offset + vendorLength);
        offset += vendorLength;
        if (offset + 4 > packet.length) return null;
        const count = packet.readUInt32LE(offset);
        offset += 4;
        const comments = [];
        for (let index = 0; index < count; index++) {
            if (offset + 4 > packet.length) return null;
            const length = packet.readUInt32LE(offset);
            offset += 4;
            if (offset + length > packet.length) return null;
            comments.push(packet.subarray(offset, offset + length).toString('utf8'));
            offset += length;
        }
        let framing = null;
        if (codec === 'vorbis') {
            if (offset >= packet.length) return null;
            framing = packet[offset];
            offset++;
        }
        return {
            vendor: vendor,
            comments: comments,
            framing: framing
        };
    }

    function buildOggComment(packetInfo, codec, pictureBase64) {
        const comments = packetInfo.comments.filter((comment) =>
            !/^METADATA_BLOCK_PICTURE=/i.test(comment));
        comments.push('METADATA_BLOCK_PICTURE=' + pictureBase64);
        const parts = [];
        if (codec === 'vorbis') {
            parts.push(Buffer.from([3]));
            parts.push(Buffer.from('vorbis', 'latin1'));
        } else {
            parts.push(Buffer.from('OpusTags', 'latin1'));
        }
        parts.push(u32le(packetInfo.vendor.length), packetInfo.vendor);
        parts.push(u32le(comments.length));
        for (const comment of comments) {
            const encoded = Buffer.from(comment, 'utf8');
            parts.push(u32le(encoded.length), encoded);
        }
        if (codec === 'vorbis') parts.push(Buffer.from([1]));
        return Buffer.concat(parts);
    }

    function addOggPicture(filePath, cover) {
        if (!cover || !fs.existsSync(filePath)) return false;
        const input = fs.readFileSync(filePath);
        const pages = parseOggPages(input);
        if (!pages.length) return false;

        const serials = Array.from(new Set(pages.map((page) => page.serial)));
        if (serials.length !== 1) return false;
        const serial = serials[0];
        const packets = packetsForSerial(pages, serial);
        if (packets.length < 2) return false;

        const identification = packets[0].data;
        let codec = null;
        if (identification.length >= 7 &&
            identification[0] === 1 &&
            identification.toString('latin1', 1, 7) === 'vorbis') {
            codec = 'vorbis';
        } else if (identification.length >= 8 &&
            identification.toString('latin1', 0, 8) === 'OpusHead') {
            codec = 'opus';
        }
        if (!codec) return false;

        const headerCount = codec === 'vorbis' ? 3 : 2;
        if (packets.length < headerCount) return false;
        const commentPacket = packets[1].data;
        if (codec === 'vorbis') {
            if (commentPacket.length < 7 ||
                commentPacket[0] !== 3 ||
                commentPacket.toString('latin1', 1, 7) !== 'vorbis') {
                return false;
            }
        } else if (commentPacket.toString('latin1', 0, 8) !== 'OpusTags') {
            return false;
        }

        const commentInfo = parseOggComment(commentPacket, codec);
        if (!commentInfo) return false;
        const pictureBase64 = buildVorbisPictureBlock(cover);
        if (!pictureBase64) return false;
        const newComment = buildOggComment(commentInfo, codec, pictureBase64);

        const headerPackets = packets.slice(0, headerCount).map((packet, index) =>
            index === 1 ? newComment : packet.data);
        const firstHeaderPage = packets[0].startPage;
        const lastHeaderPage = packets[headerCount - 1].endPage;
        if (firstHeaderPage !== 0) return false;
        if (packets.length > headerCount &&
            packets[headerCount].startPage <= lastHeaderPage) {
            // A page mixes header packets and audio. Repaginating that safely is
            // more involved than this muxer needs; leave the file untouched.
            return false;
        }

        const newHeaderPages = [];
        let sequence = 0;
        for (let index = 0; index < headerPackets.length; index++) {
            const packetPages = paginateOggPacket(
                headerPackets[index], serial, sequence, index === 0);
            sequence += packetPages.length;
            newHeaderPages.push.apply(newHeaderPages, packetPages);
        }

        const delta = newHeaderPages.length - (lastHeaderPage - firstHeaderPage + 1);
        const output = [].concat(newHeaderPages);
        for (let index = lastHeaderPage + 1; index < pages.length; index++) {
            const page = pages[index];
            if (page.serial !== serial) {
                output.push(input.subarray(page.offset, page.end));
                continue;
            }
            output.push(buildOggPage(page.serial, page.sequence + delta,
                page.headerType, page.granule, page.lacing, page.payload));
        }

        fs.writeFileSync(filePath, Buffer.concat(output));
        return true;
    }

    function injectMp4Cover(filePath, cover) {
        if (!cover || !fs.existsSync(filePath)) return false;
        const buffer = fs.readFileSync(filePath);
        const image = fs.readFileSync(cover.path);
        const containers = new Set([
            'moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'meta', 'ilst'
        ]);

        function boxSize(position) {
            let size = buffer.readUInt32BE(position);
            if (size === 1) size = Number(buffer.readBigUInt64BE(position + 8));
            return size;
        }

        function boxType(position) {
            return buffer.toString('latin1', position + 4, position + 8);
        }

        function findChain(start, end, target, chain) {
            let position = start;
            while (position + 8 <= end) {
                const size = boxSize(position);
                if (size < 8 || position + size > end) break;
                const type = boxType(position);
                const next = chain.concat([{ pos: position, type: type }]);
                if (type === target) return next;
                if (containers.has(type)) {
                    let childStart = position + 8;
                    if (type === 'meta') childStart += 4;
                    const found = findChain(childStart, position + size, target, next);
                    if (found) return found;
                }
                position += size;
            }
            return null;
        }

        const chain = findChain(0, buffer.length, 'ilst', []);
        if (!chain) return false;
        const target = chain[chain.length - 1];
        const insertAt = target.pos + boxSize(target.pos);

        const dataBox = Buffer.concat([
            u32(16 + image.length),
            Buffer.from('data', 'latin1'),
            u32(pictureTypeFor(cover)),
            u32(0),
            image
        ]);
        const covrBox = Buffer.concat([
            u32(8 + dataBox.length),
            Buffer.from('covr', 'latin1'),
            dataBox
        ]);
        const delta = covrBox.length;

        const output = Buffer.concat([
            buffer.subarray(0, insertAt),
            covrBox,
            buffer.subarray(insertAt)
        ]);

        for (const item of chain) {
            const size = output.readUInt32BE(item.pos);
            if (size === 1) {
                const large = Number(output.readBigUInt64BE(item.pos + 8));
                output.writeBigUInt64BE(BigInt(large + delta), item.pos + 8);
            } else {
                output.writeUInt32BE(size + delta, item.pos);
            }
        }

        function patchChunkOffsets(start, end) {
            let position = start;
            while (position + 8 <= end) {
                const size = output.readUInt32BE(position);
                if (size < 8 || position + size > end) break;
                const type = output.toString('latin1', position + 4, position + 8);
                if (type === 'stco' || type === 'co64') {
                    const count = output.readUInt32BE(position + 12);
                    const width = type === 'stco' ? 4 : 8;
                    for (let index = 0; index < count; index++) {
                        const offsetPosition = position + 16 + index * width;
                        if (offsetPosition + width > position + size) break;
                        if (width === 4) {
                            const oldOffset = output.readUInt32BE(offsetPosition);
                            if (oldOffset >= insertAt) {
                                output.writeUInt32BE(oldOffset + delta, offsetPosition);
                            }
                        } else {
                            const oldOffset = Number(output.readBigUInt64BE(offsetPosition));
                            if (oldOffset >= insertAt) {
                                output.writeBigUInt64BE(BigInt(oldOffset + delta), offsetPosition);
                            }
                        }
                    }
                }
                if (containers.has(type)) {
                    let childStart = position + 8;
                    if (type === 'meta') childStart += 4;
                    patchChunkOffsets(childStart, position + size);
                }
                position += size;
            }
        }

        patchChunkOffsets(0, output.length);
        fs.writeFileSync(filePath, output);
        return true;
    }

    function synchsafe(value) {
        return Buffer.from([
            (value >>> 21) & 0x7f,
            (value >>> 14) & 0x7f,
            (value >>> 7) & 0x7f,
            value & 0x7f
        ]);
    }

    function utf16(value) {
        return Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(String(value), 'utf16le')
        ]);
    }

    function id3Frame(id, data) {
        const header = Buffer.alloc(10);
        header.write(id, 0, 'latin1');
        header.writeUInt32BE(data.length, 4);
        header.writeUInt16BE(0, 8);
        return Buffer.concat([header, data]);
    }

    function id3TextFrame(id, value) {
        return id3Frame(id, Buffer.concat([Buffer.from([1]), utf16(value)]));
    }

    function id3TxxxFrame(description, value) {
        return id3Frame('TXXX', Buffer.concat([
            Buffer.from([1]),
            utf16(description),
            Buffer.from([0, 0]),
            utf16(value)
        ]));
    }

    function id3CommentFrame(value) {
        return id3Frame('COMM', Buffer.concat([
            Buffer.from([1]),
            Buffer.from('eng', 'latin1'),
            utf16(''),
            Buffer.from([0, 0]),
            utf16(value)
        ]));
    }

    function id3ApicFrame(cover) {
        if (!cover) return null;
        const image = fs.readFileSync(cover.path);
        return id3Frame('APIC', Buffer.concat([
            Buffer.from([0]),
            Buffer.from(mimeFor(cover), 'latin1'),
            Buffer.from([0]),
            Buffer.from([3]),
            Buffer.from([0]),
            image
        ]));
    }

    function buildId3v2(tags, cover) {
        const frames = [];
        const standard = {
            title: 'TIT2',
            artist: 'TPE1',
            album: 'TALB',
            album_artist: 'TPE2',
            date: 'TYER',
            year: 'TYER',
            genre: 'TCON',
            track: 'TRCK',
            disc: 'TPOS',
            composer: 'TCOM',
            copyright: 'TCOP',
            encoder: 'TENC'
        };
        const seen = new Set();

        for (const key of Object.keys(tags || {})) {
            const value = tags[key];
            if (value === undefined || value === null || value === '') continue;
            const lower = String(key).toLowerCase();
            if (lower === 'comment') {
                frames.push(id3CommentFrame(value));
                seen.add(lower);
                continue;
            }
            const frameId = standard[lower];
            if (frameId) {
                frames.push(id3TextFrame(frameId, value));
                seen.add(lower);
            }
        }

        for (const key of Object.keys(tags || {})) {
            const value = tags[key];
            if (value === undefined || value === null || value === '') continue;
            const lower = String(key).toLowerCase();
            if (seen.has(lower) || lower === 'comment') continue;
            if (lower === 'encoder' || lower === 'major_brand' ||
                lower === 'minor_version' || lower === 'compatible_brands') {
                continue;
            }
            frames.push(id3TxxxFrame(key, value));
        }

        const picture = id3ApicFrame(cover);
        if (picture) frames.push(picture);

        const body = Buffer.concat(frames);
        const header = Buffer.alloc(10);
        header.write('ID3', 0, 'latin1');
        header[3] = 3;
        header[4] = 0;
        header[5] = 0;
        synchsafe(body.length).copy(header, 6);
        return Buffer.concat([header, body]);
    }

    function prependId3v2(filePath, tags, cover) {
        if (!fs.existsSync(filePath)) return false;
        const tag = buildId3v2(tags, cover);
        const audio = fs.readFileSync(filePath);
        fs.writeFileSync(filePath, Buffer.concat([tag, audio]));
        return true;
    }

    function appendWavId3(filePath, tags, cover) {
        if (!fs.existsSync(filePath)) return false;
        const buffer = fs.readFileSync(filePath);
        if (buffer.length < 12 ||
            buffer.toString('latin1', 0, 4) !== 'RIFF' ||
            buffer.toString('latin1', 8, 12) !== 'WAVE') {
            return false;
        }
        const riffSize = buffer.readUInt32LE(4);
        if (riffSize === 0xFFFFFFFF) return false;
        const tag = buildId3v2(tags, cover);
        const paddedLength = tag.length + (tag.length % 2);
        const chunk = Buffer.alloc(8 + paddedLength);
        chunk.write('id3 ', 0, 'latin1');
        chunk.writeUInt32LE(paddedLength, 4);
        tag.copy(chunk, 8);
        const output = Buffer.concat([buffer, chunk]);
        const baseSize = riffSize > 0 && riffSize + 8 <= buffer.length
            ? riffSize
            : buffer.length - 8;
        if (baseSize + chunk.length > 0xFFFFFFFF) return false;
        output.writeUInt32LE(baseSize + chunk.length, 4);
        fs.writeFileSync(filePath, output);
        return true;
    }

    async function buildFormatArgs(input) {
        const format = input.format;
        const config = OUTPUT_FORMATS[format];
        if (!config) throw new HttpError(400, 'Unsupported output format: ' + format);

        const bitrate = clampInteger(input.bitrate, 6, 512, 192);
        const rate = clampInteger(input.rate, 8000, 96000, 44100);
        const outputRate = format === 'OPUS' ? 48000 : rate;
        const bitDepth = normalizeBitDepth(input.bitDepth);
        const mode = input.mode || 'VARIABLE';
        const channels = Number(input.channels) || 0;

        const args = [
            '-hide_banner', '-nostdin', '-v', 'error', '-y',
            '-i', input.input,
            '-map', '0:a:0',
            '-map_metadata', '0',
            '-map_metadata:s:a:0', '0:s:a:0',
            '-map_chapters', '0',
            '-ar', String(outputRate)
        ];

        // Ogg/Opus expose their tags as stream metadata, not format metadata.
        // Copy every user-visible tag onto the output format as well so muxers
        // that only read format-level metadata (FLAC, MP3, MP4, AIFF, ...)
        // do not silently drop those fields.
        const sourceTags = await probeTags(input.input);
        args.push.apply(args, buildMetadataArgs(sourceTags));

        if (config.artwork === 'stream') {
            const streams = await probeStreams(input.input);
            const pictures = streams.filter((stream) =>
                stream &&
                stream.codec_type === 'video' &&
                stream.disposition &&
                Number(stream.disposition.attached_pic) === 1
            );
            if (pictures.length) {
                for (const picture of pictures) {
                    args.push('-map', '0:' + picture.index);
                }
                args.push('-c:v', 'copy', '-disposition:v', 'attached_pic');
            } else if (!streams.length) {
                // If probing failed, keep the optional mapping so a cover is not
                // lost just because ffprobe was unavailable.
                args.push('-map', '0:v?', '-c:v', 'copy',
                    '-disposition:v', 'attached_pic');
            }
        }

        if (format === 'WAV') {
            args.push('-c:a',
                bitDepth === '8' ? 'pcm_u8' :
                bitDepth === '64f' ? 'pcm_f64le' :
                bitDepth === '32f' ? 'pcm_f32le' :
                bitDepth === '32' ? 'pcm_s32le' :
                bitDepth === '24' ? 'pcm_s24le' : 'pcm_s16le');
        } else if (format === 'AIFF') {
            args.push('-c:a',
                bitDepth === '8' ? 'pcm_s8' :
                bitDepth === '64f' ? 'pcm_f64be' :
                bitDepth === '32f' ? 'pcm_f32be' :
                bitDepth === '32' ? 'pcm_s32be' :
                bitDepth === '24' ? 'pcm_s24be' : 'pcm_s16be');
            args.push('-write_id3v2', '1');
        } else if (format === 'FLAC') {
            args.push('-c:a', 'flac',
                '-compression_level', String(clampInteger(input.flacCompression, 0, 12, 8)));
            if (bitDepth === '24') {
                args.push('-sample_fmt', 's32', '-bits_per_raw_sample', '24');
            } else if (bitDepth === '32') {
                args.push('-sample_fmt', 's32');
            } else {
                args.push('-sample_fmt', 's16');
            }
        } else if (format === 'ALAC') {
            args.push('-c:a', 'alac');
            if (bitDepth === '24') {
                args.push('-sample_fmt', 's32p', '-bits_per_raw_sample', '24');
            } else if (bitDepth === '32') {
                args.push('-sample_fmt', 's32p');
            } else {
                args.push('-sample_fmt', 's16p');
            }
        } else if (format === 'WAVPACK') {
            args.push('-c:a', 'wavpack');
            if (bitDepth === '8') {
                args.push('-sample_fmt', 'u8p');
            } else if (bitDepth === '32f') {
                args.push('-sample_fmt', 'fltp');
            } else if (bitDepth === '32') {
                args.push('-sample_fmt', 's32p');
            } else if (bitDepth === '24') {
                args.push('-sample_fmt', 's32p', '-bits_per_raw_sample', '24');
            } else {
                args.push('-sample_fmt', 's16p');
            }
        } else if (format === 'MP3') {
            const encoder = chooseEncoder(config.codecCandidates);
            if (!encoder) {
                throw new HttpError(501, 'MP3 encoding is not available on this server.');
            }
            args.push('-c:a', encoder);
            if (encoder === 'libmp3lame' && mode === 'VARIABLE') {
                args.push('-q:a', '2');
            } else {
                args.push('-b:a', bitrate + 'k');
            }
            args.push('-id3v2_version', '3', '-write_id3v1', '1');
        } else if (format === 'OGG') {
            const encoder = chooseEncoder(config.codecCandidates);
            if (!encoder) {
                throw new HttpError(501, 'Ogg Vorbis encoding is not available on this server.');
            }
            args.push('-c:a', encoder);
            if (encoder === 'vorbis') args.push('-strict', '-2');
            if (channels !== 2) args.push('-ac', '2');
            if (input.vorbisQuality) {
                args.push('-q:a', String(clampInteger(input.vorbisQuality, 1, 10, 6)));
            } else {
                args.push('-b:a', bitrate + 'k');
            }
        } else if (format === 'OPUS') {
            const encoder = chooseEncoder(config.codecCandidates);
            if (!encoder) {
                throw new HttpError(501, 'Opus encoding is not available on this server.');
            }
            args.push('-c:a', encoder);
            if (encoder === 'opus') args.push('-strict', '-2');
            if (channels > 2) args.push('-ac', '2');
            args.push('-b:a', bitrate + 'k');
            if (encoder === 'libopus') {
                args.push('-vbr', mode === 'CONSTANT' ? 'off' : 'on');
                if (input.opusFrameDuration) {
                    args.push('-frame_duration', String(input.opusFrameDuration));
                }
                if (input.opusApplication) {
                    args.push('-application', String(input.opusApplication));
                }
            }
        } else if (format === 'AC3') {
            args.push('-c:a', 'ac3', '-b:a', bitrate + 'k');
        } else if (format === 'WMA') {
            args.push('-c:a', 'wmav2', '-b:a', bitrate + 'k');
        } else if (format === 'MP2') {
            args.push('-c:a', 'mp2', '-b:a', bitrate + 'k');
        } else if (format === 'IMA_ADPCM') {
            args.push('-c:a', 'adpcm_ima_wav');
        } else if (format === 'MS_ADPCM') {
            args.push('-c:a', 'adpcm_ms');
        } else if (format === 'AAC') {
            args.push('-c:a', 'aac', '-b:a', bitrate + 'k');
        }

        if (config.mov) {
            args.push('-movflags', '+faststart+use_metadata_tags');
        }
        args.push(input.output);
        return args;
    }

    return {
        OUTPUT_FORMATS: OUTPUT_FORMATS,
        normalizeFormat: normalizeFormat,
        normalizeBitDepth: normalizeBitDepth,
        buildMetadataArgs: buildMetadataArgs,
        loadEncoders: loadEncoders,
        chooseEncoder: chooseEncoder,
        probeStreams: probeStreams,
        probeTags: probeTags,
        inspectMetadata: inspectMetadata,
        findCoverArt: findCoverArt,
        buildVorbisPictureBlock: buildVorbisPictureBlock,
        addOggPicture: addOggPicture,
        injectMp4Cover: injectMp4Cover,
        prependId3v2: prependId3v2,
        appendWavId3: appendWavId3,
        buildFormatArgs: buildFormatArgs
    };
}

module.exports = {
    createMediaTools: createMediaTools,
    OUTPUT_FORMATS: OUTPUT_FORMATS,
    normalizeFormat: normalizeFormat,
    normalizeBitDepth: normalizeBitDepth
};
