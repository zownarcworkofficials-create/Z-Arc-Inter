import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/media_capabilities.proto";
export interface MediaCapabilities {
    videoFormatCapabilities: MediaCapabilities_VideoFormatCapability[];
    audioFormatCapabilities: MediaCapabilities_AudioFormatCapability[];
    perPlaybackAttributes?: MediaCapabilities_PerPlaybackAttributes | undefined;
    hdrModeBitmask?: number | undefined;
}
export interface MediaCapabilities_PerPlaybackAttributes {
    itagDenylist: number[];
}
export interface MediaCapabilities_VideoFormatCapability {
    videoCodec?: number | undefined;
    efficient?: boolean | undefined;
    maxHeight?: number | undefined;
    maxWidth?: number | undefined;
    maxFramerate?: number | undefined;
    maxBitrateBps?: number | undefined;
    is10BitSupported?: boolean | undefined;
}
export interface MediaCapabilities_AudioFormatCapability {
    audioCodec?: number | undefined;
    numChannels?: number | undefined;
    maxBitrateBps?: number | undefined;
    spatialCapabilityBitmask?: number | undefined;
}
export declare const MediaCapabilities: MessageFns<MediaCapabilities>;
export declare const MediaCapabilities_PerPlaybackAttributes: MessageFns<MediaCapabilities_PerPlaybackAttributes>;
export declare const MediaCapabilities_VideoFormatCapability: MessageFns<MediaCapabilities_VideoFormatCapability>;
export declare const MediaCapabilities_AudioFormatCapability: MessageFns<MediaCapabilities_AudioFormatCapability>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
