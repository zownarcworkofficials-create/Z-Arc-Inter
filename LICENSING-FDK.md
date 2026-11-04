# FDK AAC build — licensing warning

This repository now contains an optional server-side AAC backend that can use
Fraunhofer FDK AAC (`libfdk_aac`).

**This build is not “open-source compliant” and it does not eliminate legal or
financial risk.**

FFmpeg classifies `libfdk_aac` as `nonfree`. The configure flags used by
`scripts/build-ffmpeg-fdk.sh` are:

```text
--enable-libfdk-aac
--enable-nonfree
```

Consequences:

- The resulting FFmpeg binary is **not redistributable**. Do not publish it,
  copy it into the website, put it in a container image that is distributed to
  customers, or expose it as a download.
- FDK AAC has its own license terms from Fraunhofer. They are not the same as
  FFmpeg’s LGPL/GPL terms.
- AAC encoding/decoding can involve patent and royalty obligations depending on
  your jurisdiction and business model. Those obligations are not removed by
  compiling locally.
- “Server-side only” reduces distribution exposure. It does not make the codec
  license disappear.

If you need a build with no nonfree components, use FFmpeg’s native `aac`
encoder or a codec with terms that fit your business, and have counsel review
the result.

The backend keeps the compiled binary outside the static website directory and
never serves it. The browser only receives converted `.m4a` files.
