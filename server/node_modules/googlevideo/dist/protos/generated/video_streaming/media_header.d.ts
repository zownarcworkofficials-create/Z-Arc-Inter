import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CompressionType, FormatId } from "../misc/common.js";
import { TimeRange } from "./time_range.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/media_header.proto";
export interface MediaHeader {
    headerId?: number | undefined;
    videoId?: string | undefined;
    itag?: number | undefined;
    lmt?: string | undefined;
    xtags?: string | undefined;
    segmentByteRangeStart?: string | undefined;
    compressionType?: CompressionType | undefined;
    isInitializationSegment?: boolean | undefined;
    segmentNum?: number | undefined;
    bitrateBps?: string | undefined;
    startMs?: string | undefined;
    durationMs?: string | undefined;
    formatId?: FormatId | undefined;
    segmentLengthBytes?: string | undefined;
    timeRange?: TimeRange | undefined;
    segmentLmt?: string | undefined;
    /** @TODO: unsure if this is 17 */
    offsetFromStartOfSegment?: string | undefined;
    /** @TODO: unsure if this is 18 */
    partialBytesToReturn?: string | undefined;
}
export declare const MediaHeader: MessageFns<MediaHeader>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
