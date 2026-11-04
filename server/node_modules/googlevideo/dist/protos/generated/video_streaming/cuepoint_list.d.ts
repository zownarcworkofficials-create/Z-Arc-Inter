import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CuepointInfo } from "./cuepoint_info.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/cuepoint_list.proto";
export interface CuepointList {
    ssapInfos: CuepointInfo[];
}
export declare const CuepointList: MessageFns<CuepointList>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
