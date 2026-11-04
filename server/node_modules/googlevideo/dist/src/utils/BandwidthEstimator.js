export class BandwidthEstimator {
    halfLifeFastSec;
    halfLifeSlowSec;
    safetyFactor;
    maxSampleDurationSec;
    seedMinDurationSec;
    fast = 0;
    slow = 0;
    hasValue = false;
    pendingBytes = 0;
    pendingSec = 0;
    constructor(options = {}) {
        this.halfLifeFastSec = options.halfLifeFastSec ?? 1.0;
        this.halfLifeSlowSec = options.halfLifeSlowSec ?? 5.0;
        this.safetyFactor = options.safetyFactor ?? 0.9;
        this.maxSampleDurationSec = options.maxSampleDurationSec ?? 5.0;
        this.seedMinDurationSec = options.seedMinDurationSec ?? 0.1;
    }
    reset() {
        this.fast = this.slow = 0;
        this.hasValue = false;
        this.pendingBytes = this.pendingSec = 0;
    }
    /**
     * Bytes received, and the seconds the network made us wait for them.
     */
    add(bytes, seconds) {
        if (!(bytes > 0) || !(seconds > 0))
            return;
        if (seconds > this.maxSampleDurationSec)
            return;
        if (!this.hasValue) {
            this.pendingBytes += bytes;
            this.pendingSec += seconds;
            if (this.pendingSec >= this.seedMinDurationSec) {
                this.fast = this.slow = this.pendingBytes / this.pendingSec;
                this.hasValue = true;
                this.pendingBytes = this.pendingSec = 0;
            }
            return;
        }
        const rate = bytes / seconds;
        const aFast = 1 - Math.exp(-seconds / this.halfLifeFastSec);
        const aSlow = 1 - Math.exp(-seconds / this.halfLifeSlowSec);
        this.fast += aFast * (rate - this.fast);
        this.slow += aSlow * (rate - this.slow);
    }
    /**
     * Returns bytes/sec.
     * @NOTE: 0 until there's data...
     */
    get() {
        if (!this.hasValue)
            return 0;
        return Math.min(this.fast, this.slow) * this.safetyFactor;
    }
}
//# sourceMappingURL=BandwidthEstimator.js.map