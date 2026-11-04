import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/reload_player_response.proto";
export interface ReloadPlaybackParams {
    token?: string | undefined;
}
export interface ReloadPlaybackContext {
    reloadPlaybackParams?: ReloadPlaybackParams | undefined;
}
export declare const ReloadPlaybackParams: MessageFns<ReloadPlaybackParams>;
export declare const ReloadPlaybackContext: MessageFns<ReloadPlaybackContext>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
