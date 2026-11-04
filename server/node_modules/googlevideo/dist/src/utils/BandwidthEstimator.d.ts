export interface BandwidthEstimatorOptions {
    halfLifeFastSec?: number;
    halfLifeSlowSec?: number;
    safetyFactor?: number;
    maxSampleDurationSec?: number;
    seedMinDurationSec?: number;
}
export declare class BandwidthEstimator {
    private readonly halfLifeFastSec;
    private readonly halfLifeSlowSec;
    private readonly safetyFactor;
    private readonly maxSampleDurationSec;
    private readonly seedMinDurationSec;
    private fast;
    private slow;
    private hasValue;
    private pendingBytes;
    private pendingSec;
    constructor(options?: BandwidthEstimatorOptions);
    reset(): void;
    /**
     * Bytes received, and the seconds the network made us wait for them.
     */
    add(bytes: number, seconds: number): void;
    /**
     * Returns bytes/sec.
     * @NOTE: 0 until there's data...
     */
    get(): number;
}
