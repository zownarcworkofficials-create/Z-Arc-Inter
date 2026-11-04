export declare function u8ToBase64(u8: Uint8Array): string;
export declare function base64ToU8(base64: string): Uint8Array;
export declare function concatenateChunks(chunks: Uint8Array[]): Uint8Array;
export declare function decodePart<T>(chunks: Uint8Array[], decoder: {
    decode: (data: Uint8Array) => T;
}): T | undefined;
