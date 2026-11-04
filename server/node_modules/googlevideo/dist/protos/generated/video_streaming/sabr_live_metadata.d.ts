import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/sabr_live_metadata.proto";
export interface SabrLiveMetadata {
    broadcastId?: string | undefined;
    headSequenceNumber?: string | undefined;
    headTimeMs?: string | undefined;
    wallTimeMs?: string | undefined;
    videoId?: string | undefined;
    postLiveDvr?: boolean | undefined;
    headm?: string | undefined;
    minSeekableTimeTicks?: string | undefined;
    minSeekableTimescale?: number | undefined;
    maxSeekableTimeTicks?: string | undefined;
    maxSeekableTimescale?: number | undefined;
}
export declare const SabrLiveMetadata: MessageFns<SabrLiveMetadata>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
