# Server-side audio conversion backend

The backend converts every supported output format and preserves source
metadata, custom key/value tags, chapters, and embedded cover art wherever the
server's muxers can store them.

- **AAC-LC** is encoded by **Apple's CoreAudio encoder** through `qaac64.exe`.
  FFmpeg decodes the upload to a temporary 24-bit PCM WAV; qaac writes the
  `.m4a`. The browser receives only the converted audio, never the encoder
  binaries.
- **Every other format** is encoded directly by the bundled FFmpeg.
- The frontend sends all formats to the backend when `AUDIO_BACKEND_URL` is
  configured. If the server cannot handle a non-AAC format, it falls back to
  the existing in-browser `ffmpeg.wasm` path.

The default AAC target is **320 kbps CBR**, with AAC-LC selected in the UI.

## 1. Metadata and artwork rules

Every conversion uses:

- `-map_metadata 0` for global/file tags.
- `-map_metadata:s:a:0 0:s:a:0` for audio-stream tags.
- `-map_chapters 0` for chapters.
- `-map 0:a:0` so only audio is encoded.
- Explicit `-metadata key=value` arguments for every user-visible tag, so
  Ogg/Opus stream tags are also written by containers that only read
  format-level metadata.

Artwork is handled per container:

| Output | Text/custom tags | Embedded artwork |
| --- | --- | --- |
| FLAC | Vorbis comments, all keys preserved | Attached picture streams copied (`-map 0:<picture>`, `-c:v copy`, `attached_pic`) |
| MP3 | ID3v2.3 (`-id3v2_version 3`), custom keys become `TXXX` frames | Attached picture stream copied into `APIC` |
| AAC / ALAC (M4A) | `-movflags +use_metadata_tags` keeps custom keys in `mdta` atoms | Cover is injected into the iTunes `covr` atom after muxing |
| OGG (Vorbis) | Vorbis comments, custom keys preserved | `METADATA_BLOCK_PICTURE` Vorbis comment |
| OPUS | Vorbis comments, custom keys preserved | `METADATA_BLOCK_PICTURE` Vorbis comment |
| MP2 | ID3v2.3 writer with standard frames, custom `TXXX`, and `APIC` | ID3 `APIC` frame |
| AIFF | ID3v2 chunk (`-write_id3v2 1`), custom keys preserved | ID3v2 `APIC` |
| WAV / IMA ADPCM / MS ADPCM | RIFF `INFO` plus an appended ID3v2 chunk; custom keys preserved | ID3v2 `APIC` in the appended chunk |
| WavPack | APEv2 tags, custom keys preserved | Not supported by the muxer; skipped |
| WMA | ASF tags, custom keys preserved | Not supported by the muxer; skipped |
| AC3 | No usable tag container | Skipped |

Container limitations are graceful: if artwork cannot be written, the audio
conversion still succeeds and text tags are kept where the container allows
them. WAV/ADPCM can carry ID3v2 even though their native muxer does not accept
attached-picture streams, so the backend appends an ID3v2 chunk after muxing.
AIFF writes ID3v2, including `APIC`, through its own muxer. AC3, WavPack, and
WMA do not expose a usable picture tag through this FFmpeg build.

### MP4/M4A cover art

FFmpeg's `use_metadata_tags` mode (needed for arbitrary custom keys) writes an
`mdta` metadata list and drops the normal iTunes `covr` atom. The backend
therefore injects a standard `covr` atom into the MP4 `ilst` after encoding and
updates the `stco`/`co64` chunk offsets. This keeps **both** custom tags and
album art.

### Ogg/Opus cover art

Ogg does not support FFmpeg attachment streams. Passing a full-resolution
base64 picture block as a command-line argument can also exceed Windows'
command-line limit for normal album art. The backend therefore muxes the Ogg
file first and then inserts the `METADATA_BLOCK_PICTURE` Vorbis comment
directly into the comment packet, repaginating only the header pages and
recalculating Ogg CRCs. Large covers work without truncation or argument-size
failures.

### MP2 tags

FFmpeg's MP2 muxer has no tag writer. The backend prepends an ID3v2.3 tag with
standard text frames, custom `TXXX` frames, and `APIC` cover art.

## 2. Requirements and licensing

On Windows the Apple encoder needs:

- `qaac64.exe`
- `CoreAudioToolbox.dll`

Both are included in foobar2000's encoder pack (the current machine has them in
`C:\Program Files\foobar2000\encoders`). They can also come from an iTunes /
Apple Application Support installation. `qaac` is a wrapper around Apple's
proprietary CoreAudio framework.

`CoreAudioToolbox.dll` is proprietary Apple software. Keep it server-side and
do not redistribute it. AAC patent/royalty obligations still apply.

FFmpeg and ffprobe are also required. They are used for decoding, non-AAC
encoding, metadata/artwork extraction, and probing. The Windows source build
described below still enables the optional FDK path, but the default Apple AAC
path never calls `libfdk_aac`. See [LICENSING-FDK.md](LICENSING-FDK.md) if you
enable the FDK fallback.

## 3. Start the backend on Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\server\start-windows.ps1
```

The script checks for `qaac64.exe`, `CoreAudioToolbox.dll`, `ffmpeg.exe` and
`ffprobe.exe`, sets `AAC_ENCODER=apple`, `QAAC_BIN`, `FFMPEG_BIN`, and
`FFPROBE_BIN`, then starts Node.

Defaults:

- qaac: auto-detected from `C:\Program Files\foobar2000\encoders\qaac64.exe`
- FFmpeg: repo-local `ffmpeg-fdk\bin\ffmpeg.exe` (fallback `D:\ffmpeg-fdk\bin\ffmpeg.exe`)
- Backend: `http://127.0.0.1:8787/`

The script and `server/index.js` both auto-detect the bundled FFmpeg, so a
stale `FFMPEG_BIN` or a moved build directory no longer breaks conversions.
Override the paths with `-QaacBin`, `-FfmpegBin`, `-FfprobeBin`, `-Port`, and
`-BindAddress`.

Open this URL directly:

```text
http://127.0.0.1:8787/
```

Serving the page and API from `8787` avoids frontend/backend port mismatches.
If you use the separate static server on `8790`, the frontend automatically
targets `http://127.0.0.1:8787`.

## 4. FFmpeg source build

The existing Linux and Windows build scripts are still used for the FFmpeg
binary that decodes input files and encodes non-AAC outputs. Do not install a
prebuilt FFmpeg package.

### Windows source build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-ffmpeg-fdk-windows.ps1
```

It installs a portable MSYS2 base at `D:\msys64` if needed, installs the MinGW
toolchain, downloads the source archives with Windows `curl`, builds FDK AAC
and FFmpeg, and verifies the installed binaries. The source downloads use
Windows `curl` because MSYS2's Git can fail to resolve GitHub on some Windows
network setups.

### Linux source build

```bash
chmod +x scripts/build-ffmpeg-fdk.sh scripts/verify-fdk.sh
sudo PREFIX=/opt/ffmpeg-fdk ./scripts/build-ffmpeg-fdk.sh
```

The Linux server can use Apple AAC only if a working qaac/CoreAudio setup is
available. Otherwise start it with the FDK fallback:

```bash
AAC_ENCODER=fdk FFMPEG_BIN=/opt/ffmpeg-fdk/bin/ffmpeg node server/index.js
```

### Encoder availability

The bundled Windows FFmpeg has `libfdk_aac`, `flac`, `alac`, `opus`, `vorbis`,
`ac3`, `wavpack`, `wmav2`, `mp2`, and `mp3_mf`. It does **not** include
`libmp3lame`, `libopus`, or `libvorbis`. The backend detects the encoder list at
startup and prefers external encoders when present:

- MP3: `libmp3lame` → `mp3_mf` → `libshine`
- Ogg Vorbis: `libvorbis` → native `vorbis` (`-strict -2`)
- Opus: `libopus` → native `opus` (`-strict -2`, resampled to 48 kHz)

If no MP3/Ogg/Opus encoder exists, the API returns `501`; the frontend then
falls back to the browser engine for that non-AAC format. When the native
`vorbis` encoder is used, an Ogg→Ogg conversion is resampled to 48 kHz because
this FFmpeg build's native encoder asserts when fed decoded Vorbis frames at
44.1 kHz. The actual rate is reported in `X-Sample-Rate`.

## 5. How AAC modes map to Apple AAC

| UI mode | qaac option | Result |
| --- | --- | --- |
| Constant (CBR) | `--cbr <kbps>` | Constant bitrate; 320 kbps for stereo 44.1/48 kHz |
| Average (ABR) | `--abr <kbps>` | Average bitrate target |
| Constrained Variable (CVBR) | `--cvbr <kbps>` | Constrained VBR target |
| Variable (VBR) | `--tvbr 127` | Apple True VBR, highest quality |

The UI selects **AAC-LC, 320 kbps, Constant (CBR)** by default when AAC is
chosen. The other modes remain selectable.

Apple AAC-LC limits:

- Stereo 44.1/48 kHz: up to 320 kbps
- Mono 44.1/48 kHz: up to 256 kbps
- 88.2/96 kHz is HE-only; the LC-only UI resamples it to 48 kHz
- The Apple path currently supports AAC-LC only. The UI exposes only AAC-LC.

The actual encoded bitrate is returned in `X-Actual-Bitrate` and is shown in
the UI. A mono file therefore reports 256 kbps even if 320 was requested.

## 6. API

```http
POST /api/convert?format=FLAC&filename=track.flac&bitrate=192&rate=44100&bitDepth=24
Content-Type: application/octet-stream

<raw file bytes>
```

Query parameters:

| Parameter | Purpose |
| --- | --- |
| `format` | `WAV`, `FLAC`, `MP3`, `AAC`, `OGG`, `AIFF`, `ALAC`, `OPUS`, `AC3`, `WAVPACK`, `WMA`, `MP2`, `IMA_ADPCM`, or `MS_ADPCM` |
| `filename` | Original name, used for the download name and input extension |
| `mode` | `CONSTANT`, `AVERAGE`, `CONSTRAINED`, or `VARIABLE` |
| `bitrate` | Target kbps for lossy formats |
| `rate` | Output sample rate (Opus is always resampled to 48000) |
| `profile` | AAC profile (`AACLC` for the Apple path) |
| `bitDepth` | `8`, `16`, `24`, `32`, `32f`, or `64f` for PCM/FLAC/ALAC/WavPack |
| `flacCompression` | FLAC compression level, 0–12 |
| `vorbisQuality` | Vorbis quality, 1–10 |
| `opusQuality` | Reserved for external Opus encoders |
| `opusFrameDuration` | Frame duration for `libopus`; ignored by native Opus |
| `opusApplication` | `audio`, `voip`, or `lowdelay` for `libopus` |

The response `Content-Type` depends on the format (`audio/flac`, `audio/mpeg`,
`audio/mp4`, `audio/ogg`, `audio/wav`, etc.) and includes:

- `X-Actual-Bitrate` (kbps, when ffprobe is available)
- `X-Sample-Rate` (actual output rate; Opus is always 48000)
- `X-Output-Format`
- `X-Encoder`
- `X-AAC-Encoder` and `X-AAC-Mode` for AAC compatibility

Errors are plain text with a non-2xx status. If qaac or CoreAudioToolbox is
missing, AAC requests return `503`; non-AAC formats still work.

## 7. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `AAC_ENCODER` | `apple` | `apple` or `fdk` |
| `QAAC_BIN` | auto-detected qaac64.exe | Apple AAC wrapper |
| `FFMPEG_BIN` | auto-detected (`ffmpeg-fdk/bin`, else `PATH`) | FFmpeg used for decoding and non-AAC output |
| `FFPROBE_BIN` | sibling `ffprobe`/`ffprobe.exe` | Metadata, duration, and bitrate probe |
| `STATIC_DIR` | repository root | Website directory |
| `MAX_UPLOAD_BYTES` | `536870912` | 512 MiB upload limit |
| `JOB_TIMEOUT_MS` | `900000` | 15 minute job timeout |
| `ALLOWED_ORIGIN` | `*` | CORS origin |
| `SKIP_AAC_CHECK` | unset | `1` starts without verifying the AAC encoder |

Health check:

```bash
curl -s http://127.0.0.1:8787/api/health
```

A working Apple backend returns `"ok": true`, `"encoder": "apple-aac"`,
`"qaacVersion": "2.85"`, `"coreAudioToolbox": "7.10.9.0"` (versions vary), and
a `"formats"` array listing every output format handled by the server.

## 8. Verify the frontend/backend bridge

On Windows:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen
curl.exe -s -i http://127.0.0.1:8787/api/health
```

In the browser console on the converter page:

```javascript
location.href
AUDIO_BACKEND_URL
await (await fetch(AUDIO_BACKEND_URL + '/api/health')).text()
```

If the page is on `8790`, `AUDIO_BACKEND_URL` should be
`http://127.0.0.1:8787`. If the page is on `8787`, it should be an empty string
(same origin). If `index.html` is opened directly from disk (`file://`), it
should also be `http://127.0.0.1:8787` — never a `file:///.../api/convert` URL.

For file:// pages, requests go to the local backend over HTTP. Starting the
backend and opening `http://127.0.0.1:8787/` directly is still the most reliable
option because it avoids browser CORS rules for local files.

Run the backend argument tests with:

```powershell
node server/test-args.js
```

## 9. FDK fallback

The old source-built FFmpeg + `libfdk_aac` path remains available:

```bash
AAC_ENCODER=fdk FFMPEG_BIN=/opt/ffmpeg-fdk/bin/ffmpeg node server/index.js
```

It maps CBR/ABR/CVBR to `libfdk_aac -vbr 0 -b:a`, and VBR to `-vbr 5`. The
default Apple path does not use it. Metadata/artwork handling is the same in
both AAC paths.

## 10. What is not changed

- Encoder binaries stay outside `STATIC_DIR`.
- The backend never writes the encoder binary into the browser or a download.
- AAC still uses the Apple CoreAudio encoder by default.
- If the backend is unavailable, non-AAC formats still fall back to the
  in-browser engine.
