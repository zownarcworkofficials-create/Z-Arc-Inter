import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/streamer_context.proto";
export interface StreamerContext {
    clientInfo?: StreamerContext_ClientInfo | undefined;
    poToken?: Uint8Array | undefined;
    playbackCookie?: Uint8Array | undefined;
    field4?: Uint8Array | undefined;
    sabrContexts: StreamerContext_SabrContext[];
    unsentSabrContexts: number[];
    field7?: string | undefined;
    field8?: StreamerContext_UnknownMessage1 | undefined;
}
export interface StreamerContext_ClientInfo {
    hl?: string | undefined;
    deviceMake?: string | undefined;
    deviceModel?: string | undefined;
    clientName?: number | undefined;
    clientVersion?: string | undefined;
    osName?: string | undefined;
    osVersion?: string | undefined;
}
export interface StreamerContext_SabrContext {
    type?: number | undefined;
    value?: Uint8Array | undefined;
}
export interface StreamerContext_UnknownMessage1 {
    field1?: Uint8Array | undefined;
    field2?: StreamerContext_UnknownMessage1_UnknownInnerMessage1 | undefined;
}
export interface StreamerContext_UnknownMessage1_UnknownInnerMessage1 {
    code?: number | undefined;
    message?: string | undefined;
}
export declare const StreamerContext: MessageFns<StreamerContext>;
export declare const StreamerContext_ClientInfo: MessageFns<StreamerContext_ClientInfo>;
export declare const StreamerContext_SabrContext: MessageFns<StreamerContext_SabrContext>;
export declare const StreamerContext_UnknownMessage1: MessageFns<StreamerContext_UnknownMessage1>;
export declare const StreamerContext_UnknownMessage1_UnknownInnerMessage1: MessageFns<StreamerContext_UnknownMessage1_UnknownInnerMessage1>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
