import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/cuepoint.proto";
export interface Cuepoint {
    /** @NOTE: 1 = ad */
    type?: number | undefined;
    event?: Cuepoint_CuepointEvent | undefined;
    totalDurationSec?: number | undefined;
    playheadTimeSec?: number | undefined;
    context?: string | undefined;
    identifier?: string | undefined;
    playheadTimeAtStartSec?: number | undefined;
    mediaTimeSinceStartSec?: number | undefined;
    startSequenceNumber?: number | undefined;
}
export declare enum Cuepoint_CuepointEvent {
    UNKNOWN = 0,
    START = 1,
    CONTINUE = 2,
    STOP = 3,
    INSERTION = 4,
    PREDICT_START = 5,
    /** PREFETCH - @NOTE: A request to https://www.youtube.com/youtubei/v1/player/ad_break?prettyPrint=false is made to get the ads_config bytes */
    PREFETCH = 6,
    UNRECOGNIZED = -1
}
export declare const Cuepoint: MessageFns<Cuepoint>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
