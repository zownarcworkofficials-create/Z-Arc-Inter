import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { SeekSource } from "../misc/common.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/sabr_seek.proto";
export interface SabrSeek {
    seekMediaTime?: string | undefined;
    seekMediaTimescale?: number | undefined;
    seekSource?: SeekSource | undefined;
}
export declare const SabrSeek: MessageFns<SabrSeek>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
