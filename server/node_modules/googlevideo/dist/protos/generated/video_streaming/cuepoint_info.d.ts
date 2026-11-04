import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { Cuepoint } from "./cuepoint.js";
import { TimeRange } from "./time_range.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/cuepoint_info.proto";
export interface CuepointInfo {
    cuepoint?: Cuepoint | undefined;
    trackType?: CuepointInfo_TrackType | undefined;
    sequenceNumber?: number | undefined;
    timeRange?: TimeRange | undefined;
    tileContext?: string | undefined;
    unknownField6?: number | undefined;
    unknownField7?: number | undefined;
    opportunityId?: string | undefined;
    serializedPrefetchContext?: Uint8Array | undefined;
}
export declare enum CuepointInfo_TrackType {
    AUDIO = 1,
    VIDEO = 2,
    UNRECOGNIZED = -1
}
export declare const CuepointInfo: MessageFns<CuepointInfo>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
