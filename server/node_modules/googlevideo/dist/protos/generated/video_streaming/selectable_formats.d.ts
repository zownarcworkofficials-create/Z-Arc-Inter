import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { FormatId } from "../misc/common.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/selectable_formats.proto";
export interface SelectableFormats {
    selectableVideoFormatIds: FormatId[];
    selectableAudioFormatIds: FormatId[];
    videoId?: string | undefined;
    /** @NOTE: On iOS, this uses its own message (SelectableVideoFormat) instead of single SelectableFormat. Should probably check if there are any differences at some point. */
    selectableVideoFormats: SelectableFormats_SelectableFormat[];
    selectableAudioFormats: SelectableFormats_SelectableFormat[];
    selectableCaptionFormats: SelectableFormats_SelectableFormat[];
    restrictedFormats: SelectableFormats_SelectableFormat[];
}
export interface SelectableFormats_SelectableFormat {
    formatId?: FormatId | undefined;
}
export declare const SelectableFormats: MessageFns<SelectableFormats>;
export declare const SelectableFormats_SelectableFormat: MessageFns<SelectableFormats_SelectableFormat>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
