export declare function wait(ms: number): Promise<void>;
export declare function assert(condition: unknown, msg: string): asserts condition;
export declare function assertIsDefined<T>(val: T, msg?: string): asserts val is NonNullable<T>;
interface GetMediaTypeInput {
    mimeType?: string;
}
export declare function getMediaType(input: GetMediaTypeInput): 'audio' | 'video';
export {};
