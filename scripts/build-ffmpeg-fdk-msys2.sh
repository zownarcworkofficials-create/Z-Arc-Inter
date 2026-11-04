#!/usr/bin/env bash
#
# Build FFmpeg with Fraunhofer FDK AAC from already-extracted sources.
# Intended to be launched by scripts/build-ffmpeg-fdk-windows.ps1 under
# MSYS2/MINGW64, but it also works in a normal MSYS2 MINGW64 shell.
#
# WARNING: the result is a --enable-nonfree binary. Keep it server-side.
#
set -euo pipefail

export MSYSTEM=MINGW64
export PATH=/mingw64/bin:/usr/bin:$PATH

PREFIX="${PREFIX:-/d/ffmpeg-fdk}"
FDK_SRC="${FDK_SRC:-/d/ffmpeg-fdk-build/fdk-aac-2.0.3}"
FFMPEG_SRC="${FFMPEG_SRC:-/d/ffmpeg-fdk-build/ffmpeg-7.1.1}"
JOBS="${JOBS:-$(nproc)}"

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "ERROR: missing MSYS2/MinGW tool: $1" >&2
        exit 1
    }
}

for tool in make cc g++ pkg-config autoconf automake libtoolize nasm; do
    need "$tool"
done

[ -d "$FDK_SRC" ] || { echo "ERROR: FDK source not found: $FDK_SRC" >&2; exit 1; }
[ -d "$FFMPEG_SRC" ] || { echo "ERROR: FFmpeg source not found: $FFMPEG_SRC" >&2; exit 1; }

mkdir -p "$PREFIX"

echo "==> Building FDK AAC  ($FDK_SRC)"
(
    cd "$FDK_SRC"
    autoreconf -fiv
    ./configure --prefix="$PREFIX" --disable-shared --enable-static
    make -j"$JOBS"
    make install
)

echo "==> Building FFmpeg  ($FFMPEG_SRC)"
(
    cd "$FFMPEG_SRC"
    PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
        --prefix="$PREFIX" \
        --target-os=mingw32 \
        --arch=x86_64 \
        --enable-libfdk-aac \
        --enable-nonfree \
        --disable-doc \
        --disable-debug \
        --disable-network \
        --disable-shared \
        --enable-static \
        --pkg-config-flags="--static" \
        --extra-cflags="-I$PREFIX/include" \
        --extra-ldflags="-L$PREFIX/lib -static" \
        --extra-libs="-lstdc++ -lm"
    make -j"$JOBS"
    make install
)

echo "==> Verifying libfdk_aac"
"$PREFIX/bin/ffmpeg.exe" -hide_banner -codecs 2>&1 | grep -Eq '(^|[[:space:]])libfdk_aac([[:space:]]|$)'
"$PREFIX/bin/ffmpeg.exe" -hide_banner -version | grep -q -- '--enable-libfdk-aac'
"$PREFIX/bin/ffmpeg.exe" -hide_banner -version | grep -q -- '--enable-nonfree'
"$PREFIX/bin/ffmpeg.exe" -hide_banner -h encoder=libfdk_aac >/dev/null 2>&1

echo
echo "OK: libfdk_aac is registered."
echo "FFmpeg: $PREFIX/bin/ffmpeg.exe"
echo "ffprobe: $PREFIX/bin/ffprobe.exe"
