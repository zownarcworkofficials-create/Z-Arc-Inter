export function ticksToMs(ticks, timescale, round) {
    return round((ticks / timescale) * 1000);
}
export function getDurationMs(mediaHeader) {
    const durationMsFromHeader = Number(mediaHeader.durationMs ?? 0);
    if (Number.isFinite(durationMsFromHeader) && durationMsFromHeader > 0)
        return durationMsFromHeader;
    const durationTicks = Number(mediaHeader.timeRange?.durationTicks ?? 0);
    const timescale = Number(mediaHeader.timeRange?.timescale ?? 0);
    if (durationTicks > 0 && timescale > 0)
        return ticksToMs(durationTicks, timescale, Math.ceil);
    return 0;
}
export function getStartMs(mediaHeader) {
    const startMsFromHeader = Number(mediaHeader.startMs ?? 0);
    if (Number.isFinite(startMsFromHeader) && startMsFromHeader > 0)
        return startMsFromHeader;
    const startTicks = Number(mediaHeader.timeRange?.startTicks ?? 0);
    const timescale = Number(mediaHeader.timeRange?.timescale ?? 0);
    if (startTicks > 0 && timescale > 0)
        return ticksToMs(startTicks, timescale, Math.floor);
    return 0;
}
//# sourceMappingURL=mediaTimeUtils.js.map