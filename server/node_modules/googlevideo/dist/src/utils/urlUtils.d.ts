interface Range {
    start: number;
    end: number;
}
export declare function parseRangeHeader(rangeHeaderValue: string | undefined): Range | undefined;
export declare function getBroadcastId(url: URL): string | undefined;
export declare function getNextFallbackUrl(input: string | URL): URL | undefined;
export {};
