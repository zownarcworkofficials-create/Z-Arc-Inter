#!/usr/bin/env bash
#
# Verify that the server-side FFmpeg build exposes libfdk_aac.
#
# Usage:
#   FFMPEG_BIN=/opt/ffmpeg-fdk/bin/ffmpeg ./scripts/verify-fdk.sh
#
set -euo pipefail

BIN="${FFMPEG_BIN:-/opt/ffmpeg-fdk/bin/ffmpeg}"

if [ ! -x "$BIN" ]; then
    echo "ERROR: FFmpeg not found or not executable: $BIN" >&2
    echo "Set FFMPEG_BIN to the binary produced by scripts/build-ffmpeg-fdk.sh." >&2
    exit 1
fi

CODECS="$("$BIN" -hide_banner -codecs 2>&1)"
if ! printf '%s\n' "$CODECS" | grep -Eq '(^|[[:space:]])libfdk_aac([[:space:]]|$)'; then
    echo "ERROR: libfdk_aac is not registered in this FFmpeg build." >&2
    echo "---- ffmpeg -codecs ----" >&2
    printf '%s\n' "$CODECS" >&2
    exit 1
fi

"$BIN" -hide_banner -h encoder=libfdk_aac >/dev/null 2>&1 || {
    echo "ERROR: FFmpeg lists libfdk_aac but cannot open the encoder." >&2
    exit 1
}

echo "OK: libfdk_aac is registered and the encoder is available."
"$BIN" -hide_banner -version | head -n 1
