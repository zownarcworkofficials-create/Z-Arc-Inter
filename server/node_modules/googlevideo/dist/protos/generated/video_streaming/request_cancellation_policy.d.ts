import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare const protobufPackage = "video_streaming";
export declare const protobufFileName = "video_streaming/request_cancellation_policy.proto";
export interface RequestCancellationPolicy {
    policyEnforcementIntervalMs?: number | undefined;
    items: RequestCancellationPolicy_RequestCancellationPolicyItem[];
    noDataTimeoutMs?: number | undefined;
}
export interface RequestCancellationPolicy_RequestCancellationPolicyItem {
    unknownField1?: number | undefined;
    unknownField2?: number | undefined;
    minReadaheadMs?: number | undefined;
}
export declare const RequestCancellationPolicy: MessageFns<RequestCancellationPolicy>;
export declare const RequestCancellationPolicy_RequestCancellationPolicyItem: MessageFns<RequestCancellationPolicy_RequestCancellationPolicyItem>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
