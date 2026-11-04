import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { FormatId } from "../misc/common.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/allowed_cached_formats.proto";
export interface AllowedCachedFormats {
    formats: FormatId[];
}
export declare const AllowedCachedFormats: MessageFns<AllowedCachedFormats>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
