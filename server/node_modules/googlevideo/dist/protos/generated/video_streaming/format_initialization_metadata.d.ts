import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { FormatId, Range } from "../misc/common.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/format_initialization_metadata.proto";
export interface FormatInitializationMetadata {
    videoId?: string | undefined;
    formatId?: FormatId | undefined;
    endTimeMs?: string | undefined;
    endSegmentNum?: string | undefined;
    mimeType?: string | undefined;
    initSegmentRange?: Range | undefined;
    indexRange?: Range | undefined;
    field8?: string | undefined;
    endTimeTicks?: string | undefined;
    endTimeTimescale?: string | undefined;
    clipId?: string | undefined;
    formatStream?: Uint8Array | undefined;
}
export declare const FormatInitializationMetadata: MessageFns<FormatInitializationMetadata>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
