#!/usr/bin/env bash
#
# Source-build FFmpeg with Fraunhofer FDK AAC support.
#
# WARNING: This build uses --enable-nonfree. The resulting binary is NOT
# redistributable. Keep it on the server and do not copy it into the website
# or ship it to end users. See LICENSING-FDK.md.
#
# Requirements (install build tools yourself; do not install a distro FFmpeg
# package that already contains AAC codecs):
#   git make gcc g++ autoconf automake libtool pkg-config nasm
#
# Usage:
#   sudo PREFIX=/opt/ffmpeg-fdk ./scripts/build-ffmpeg-fdk.sh
#
set -euo pipefail

echo "WARNING: building a NONFREE FFmpeg (libfdk_aac + --enable-nonfree)."
echo "Do not redistribute the resulting binary. See LICENSING-FDK.md."
echo

PREFIX="${PREFIX:-/opt/ffmpeg-fdk}"
WORK="${WORK:-/tmp/ffmpeg-fdk-build}"
FFMPEG_TAG="${FFMPEG_TAG:-n7.1.1}"
FDK_TAG="${FDK_TAG:-v2.0.3}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
FDK_REPO="${FDK_REPO:-https://github.com/mstorsjo/fdk-aac.git}"
FFMPEG_REPO="${FFMPEG_REPO:-https://github.com/FFmpeg/FFmpeg.git}"

die() {
    echo "ERROR: $*" >&2
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || die "missing build tool: $1"
}

for tool in git make cc pkg-config autoconf automake libtoolize; do
    need "$tool"
done

if ! command -v nasm >/dev/null 2>&1 && ! command -v yasm >/dev/null 2>&1; then
    echo "WARNING: neither nasm nor yasm found; disabling x86 assembly."
fi

echo "==> FDK-AAC source: $FDK_REPO ($FDK_TAG)"
rm -rf "$WORK"
mkdir -p "$WORK"

git clone --depth 1 --branch "$FDK_TAG" "$FDK_REPO" "$WORK/fdk-aac"
(
    cd "$WORK/fdk-aac"
    autoreconf -fiv
    ./configure --prefix="$PREFIX" --disable-shared --enable-static
    make -j"$JOBS"
    make install
)

echo "==> FFmpeg source: $FFMPEG_REPO ($FFMPEG_TAG)"
git clone --depth 1 --branch "$FFMPEG_TAG" "$FFMPEG_REPO" "$WORK/ffmpeg"
(
    cd "$WORK/ffmpeg"

    EXTRA_ASM=()
    if ! command -v nasm >/dev/null 2>&1 && ! command -v yasm >/dev/null 2>&1; then
        EXTRA_ASM=(--disable-x86asm)
    fi

    PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
        --prefix="$PREFIX" \
        --enable-libfdk-aac \
        --enable-nonfree \
        --disable-doc \
        --disable-debug \
        --disable-network \
        --disable-shared \
        --enable-static \
        --pkg-config-flags="--static" \
        --extra-cflags="-I$PREFIX/include" \
        --extra-ldflags="-L$PREFIX/lib" \
        --extra-libs="-lstdc++ -lm" \
        "${EXTRA_ASM[@]}"

    make -j"$JOBS"
    make install
)

echo "==> Verifying libfdk_aac registration"
"$PREFIX/bin/ffmpeg" -hide_banner -codecs > "$WORK/ffmpeg-codecs.txt" 2>&1
if ! grep -Eq '(^|[[:space:]])libfdk_aac([[:space:]]|$)' "$WORK/ffmpeg-codecs.txt"; then
    echo "---- ffmpeg -codecs ----" >&2
    cat "$WORK/ffmpeg-codecs.txt" >&2
    die "libfdk_aac was not found in ffmpeg -codecs"
fi
"$PREFIX/bin/ffmpeg" -hide_banner -h encoder=libfdk_aac >/dev/null 2>&1 \
    || die "ffmpeg cannot open the libfdk_aac encoder"

if ! "$PREFIX/bin/ffmpeg" -hide_banner -version | grep -q -- '--enable-libfdk-aac'; then
    die "ffmpeg -version does not report --enable-libfdk-aac"
fi
if ! "$PREFIX/bin/ffmpeg" -hide_banner -version | grep -q -- '--enable-nonfree'; then
    die "ffmpeg -version does not report --enable-nonfree"
fi

echo
echo "OK: libfdk_aac is registered."
echo "FFmpeg: $PREFIX/bin/ffmpeg"
echo "Start the backend with:"
echo "  FFMPEG_BIN=$PREFIX/bin/ffmpeg node server/index.js"
