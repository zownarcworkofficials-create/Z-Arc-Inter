import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { HttpHeader } from "../misc/common.js";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/onesie_innertube_request.proto";
export interface OnesieInnertubeRequest {
    url?: string | undefined;
    headers: HttpHeader[];
    body?: string | undefined;
    proxiedByTrustedBandaid?: boolean | undefined;
    skipResponseEncryption?: boolean | undefined;
}
export declare const OnesieInnertubeRequest: MessageFns<OnesieInnertubeRequest>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
