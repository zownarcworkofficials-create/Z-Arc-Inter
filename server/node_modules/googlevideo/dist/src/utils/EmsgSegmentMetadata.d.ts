export declare const EMSG_BOX_TYPE = 1701671783;
interface BoxReader {
    data: DataView;
    offset: number;
    size: number;
    type: number;
    cursor: number;
}
export declare function findBox(data: DataView, offset: number, targetType: number): BoxReader | null;
interface EmsgBody {
    schemeIdUri: string;
    value: string;
    timescale: number;
    presentationTimeDelta: number;
    eventDuration: number;
    id: number;
    messageData: string;
}
export declare function parseEmsgBody(box: BoxReader): EmsgBody;
export declare function parseHeaderBlock(text: string): Record<string, string> | null;
/**
 * @NOTE
 * This was based on minified code from yt.
 */
export declare class EmsgSegmentMetadata {
    data: Record<string, string>;
    uri: string;
    private receivedAtMs;
    segmentNumber: number;
    totalSegmentCount: number;
    segmentDurationsMs: string;
    ingestionTimeSec: number;
    ingestionUncertaintySec: number;
    safeFirstFrameTimeSec: number;
    targetDurationSec: number;
    cryptoPeriodIndex: number;
    cryptoPeriodSeconds: number;
    currentAbsoluteLoudnessLkfs: number | null;
    constructor(data: Record<string, string>, uri?: string);
    get latencyMs(): number;
    getStitchedCPNs(): string[];
    hasStitchedAdBreakMetadata(): boolean;
}
export {};
