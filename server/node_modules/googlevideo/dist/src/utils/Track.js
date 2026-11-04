import { ticksToMs } from './mediaTimeUtils.js';
import { assertIsDefined } from './misc.js';
const MAX_TRACKED_SEGMENTS = 64; // @NOTE: only metadata, not actual media
export class Track {
    type;
    formatId;
    mimeType;
    endSegmentNum;
    endTimeTicks;
    endTimescale;
    targetDurationSec;
    trackedSegments = new Map();
    bufferedRangeSummary;
    emsgSegmentMetadata;
    _output;
    constructor(type) {
        this.type = type;
    }
    set output(value) {
        this._output = value;
    }
    get output() {
        return this._output; // This is created at the ctor of SabrStream and can never be undefined.
    }
    get streamLocked() {
        return this.output.stream.locked;
    }
    get streamDesiredSize() {
        return this.output.controller.desiredSize ?? 0;
    }
    get streamController() {
        return this.output.controller;
    }
    get streamFull() {
        return this.streamLocked && this.streamDesiredSize <= 0;
    }
    get endTimeMs() {
        if (this.endTimeTicks === undefined || this.endTimescale === undefined)
            return 0;
        return ticksToMs(this.endTimeTicks, this.endTimescale, Math.ceil);
    }
    get endOfStreamReached() {
        return (this.endSegmentNum !== undefined &&
            this.endSegmentNum > 0 &&
            this.trackedSegments.has(this.endSegmentNum));
    }
    get latencyMs() {
        if (!this.emsgSegmentMetadata)
            return undefined;
        return this.emsgSegmentMetadata.latencyMs;
    }
    update(state) {
        if ('formatId' in state)
            this.formatId = state.formatId;
        if ('mimeType' in state)
            this.mimeType = state.mimeType;
        if ('endSegmentNum' in state)
            this.endSegmentNum = state.endSegmentNum;
        if ('endTimeTicks' in state)
            this.endTimeTicks = state.endTimeTicks;
        if ('endTimescale' in state)
            this.endTimescale = state.endTimescale;
        if ('targetDurationSec' in state)
            this.targetDurationSec = state.targetDurationSec;
        if ('trackedSegments' in state)
            this.trackedSegments = new Map(state.trackedSegments);
        if ('bufferedRangeSummary' in state)
            this.bufferedRangeSummary = state.bufferedRangeSummary;
    }
    snapshot() {
        return {
            formatId: this.formatId,
            mimeType: this.mimeType,
            endSegmentNum: this.endSegmentNum,
            endTimeTicks: this.endTimeTicks,
            endTimescale: this.endTimescale,
            targetDurationSec: this.targetDurationSec,
            trackedSegments: Array.from(this.trackedSegments.entries()),
            bufferedRangeSummary: this.bufferedRangeSummary
        };
    }
    recordCompletedSegment(info, emsgMetadata) {
        let durationMs = info.durationMs;
        if (durationMs <= 0 && !info.mediaHeader.isInitializationSegment)
            durationMs = this.targetDurationSec ? this.targetDurationSec * 1000 : undefined;
        if (emsgMetadata) {
            this.emsgSegmentMetadata = emsgMetadata;
            if (emsgMetadata.targetDurationSec > 0)
                durationMs = emsgMetadata.targetDurationSec * 1000;
        }
        assertIsDefined(durationMs, `Track is missing durationMs: formatKey=${info.formatKey}, segmentNumber=${info.segmentNumber}`);
        const segmentNumber = info.segmentNumber;
        const mediaHeader = info.mediaHeader;
        const startTimeMs = info.startTimeMs;
        const endTimeMs = startTimeMs + durationMs;
        this.trackedSegments.set(segmentNumber, {
            segmentNumber,
            startTimeMs,
            endTimeMs,
            durationMs,
            mediaHeader
        });
        this.evictOldestTrackedSegments();
        this.refreshBufferedRanges();
    }
    refreshBufferedRanges() {
        let first;
        let last;
        for (const segment of this.trackedSegments.values()) {
            if (segment.mediaHeader.isInitializationSegment)
                continue;
            if (!first || segment.segmentNumber < first.segmentNumber)
                first = segment;
            if (!last || segment.segmentNumber > last.segmentNumber)
                last = segment;
        }
        if (!first || !last) {
            this.bufferedRangeSummary = undefined;
            return;
        }
        this.bufferedRangeSummary = {
            startTimeMs: first.startTimeMs,
            durationMs: Math.max(0, last.endTimeMs - first.startTimeMs),
            startSegmentIndex: first.segmentNumber,
            endSegmentIndex: last.segmentNumber
        };
    }
    evictOldestTrackedSegments() {
        while (this.trackedSegments.size > MAX_TRACKED_SEGMENTS) {
            const oldestKey = this.trackedSegments.keys().next().value;
            if (oldestKey === undefined)
                break;
            this.trackedSegments.delete(oldestKey);
        }
    }
}
//# sourceMappingURL=Track.js.map