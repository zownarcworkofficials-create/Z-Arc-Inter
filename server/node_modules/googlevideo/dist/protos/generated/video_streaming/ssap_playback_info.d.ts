import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/ssap_playback_info.proto";
export interface SsapPlaybackInfo {
    adCpns: string[];
    adsConfig?: Uint8Array | undefined;
    daiState?: string | undefined;
    skipSequence?: number | undefined;
    unknownField5?: number | undefined;
    unknownField6?: string | undefined;
    cuepointId?: string | undefined;
    state?: SsapPlaybackInfo_AdState | undefined;
    tileContext?: string | undefined;
    startTimeMs?: string | undefined;
    durationMs?: string | undefined;
}
export declare enum SsapPlaybackInfo_AdState {
    UNKNOWN = 0,
    TIMEOUT = 1,
    /** RATECONTROL - when /ad_break returns adThrottled=true */
    RATECONTROL = 2,
    /** RATECONTROL_CLIENT - when the client itself throttles ad requests? */
    RATECONTROL_CLIENT = 11,
    SERVER_ERROR = 3,
    DELETED = 4,
    WAITING = 5,
    READY = 6,
    SSDISABLED = 7,
    SSDISABLED_USTREAMER = 9,
    SSDISABLED_NO_CONFIG = 10,
    NO_DAI_CONFIG_RETURNED_IN_GAB = 12,
    INACTIVE = 8,
    CACHE_MISS = 13,
    UNRECOGNIZED = -1
}
export declare const SsapPlaybackInfo: MessageFns<SsapPlaybackInfo>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
