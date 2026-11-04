import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/playback_start_policy.proto";
export interface PlaybackStartPolicy {
    startMinReadaheadPolicy?: PlaybackStartPolicy_MinReadaheadPolicy | undefined;
    resumeMinReadaheadPolicy?: PlaybackStartPolicy_MinReadaheadPolicy | undefined;
    videoId?: string | undefined;
    startTimeoutMs?: number | undefined;
    resumeTimeoutMs?: number | undefined;
}
export interface PlaybackStartPolicy_MinReadaheadPolicy {
    minReadaheadMs?: number | undefined;
    minBandwidthBytesPerSec?: number | undefined;
}
export declare const PlaybackStartPolicy: MessageFns<PlaybackStartPolicy>;
export declare const PlaybackStartPolicy_MinReadaheadPolicy: MessageFns<PlaybackStartPolicy_MinReadaheadPolicy>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
