import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { FormatId } from "../misc/common.js";
import { BufferedRange } from "./buffered_range.js";
import { ClientAbrState } from "./client_abr_state.js";
import { SsapPlaybackInfo } from "./ssap_playback_info.js";
import { StreamerContext } from "./streamer_context.js";
import { TimeRange } from "./time_range.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/video_playback_abr_request.proto";
export interface VideoPlaybackAbrRequest {
    clientAbrState?: ClientAbrState | undefined;
    initializationFormatIds: FormatId[];
    bufferedRanges: BufferedRange[];
    mediaStartTimeMs?: string | undefined;
    videoPlaybackUstreamerConfig?: Uint8Array | undefined;
    field6?: UnknownMessage1 | undefined;
    /** @NOTE: This is the same as preferred_audio_format_ids (pai) on onesie reqs */
    selectedAudioFormatIds: FormatId[];
    /** @NOTE: This is the same as preferred_video_format_ids (pvi) on onesie reqs */
    selectedVideoFormatIds: FormatId[];
    /** @TODO: Check if onesie has an equivalent field for this */
    selectedCaptionFormatIds: FormatId[];
    streamerContext?: StreamerContext | undefined;
    serverStitchedDaiInfo?: SsapPlaybackInfo | undefined;
    lastVideoItag?: number | undefined;
    lastAudioItag?: number | undefined;
    ssapPlaybackInfos: SsapPlaybackInfo[];
    /** @NOTE: What even is this? On web, it's only set if exp html5_sabr_unused_bloat_size_bytes > 0 (as `new Uint8Array(value_of_html5_sabr_unused_bloat_size_bytes_here)`) */
    unusedBloatSizeBytes?: Uint8Array | undefined;
    field1000: UnknownMessage2[];
}
export interface UnknownMessage1 {
    formatId?: FormatId | undefined;
    lmt?: string | undefined;
    sequenceNumber?: number | undefined;
    timeRange?: TimeRange | undefined;
    field5?: number | undefined;
}
export interface UnknownMessage2 {
    formatIds: FormatId[];
    ud: BufferedRange[];
    clipId?: string | undefined;
}
export declare const VideoPlaybackAbrRequest: MessageFns<VideoPlaybackAbrRequest>;
export declare const UnknownMessage1: MessageFns<UnknownMessage1>;
export declare const UnknownMessage2: MessageFns<UnknownMessage2>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
