import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/next_request_policy.proto";
export interface NextRequestPolicy {
    targetAudioReadaheadMs?: number | undefined;
    targetVideoReadaheadMs?: number | undefined;
    maxTimeSinceLastRequestMs?: number | undefined;
    backoffTimeMs?: number | undefined;
    minAudioReadaheadMs?: number | undefined;
    minVideoReadaheadMs?: number | undefined;
    playbackCookie?: Uint8Array | undefined;
    videoId?: string | undefined;
}
export declare const NextRequestPolicy: MessageFns<NextRequestPolicy>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
