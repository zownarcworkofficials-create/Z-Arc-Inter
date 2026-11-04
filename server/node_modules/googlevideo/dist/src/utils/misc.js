export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function assert(condition, msg) {
    if (!condition)
        throw new Error(msg);
}
export function assertIsDefined(val, msg) {
    if (val === undefined || val === null)
        throw new Error(msg ?? `Expected value to be defined, but got ${val}`);
}
export function getMediaType(input) {
    return input.mimeType?.includes('audio') ? 'audio' : 'video';
}
//# sourceMappingURL=misc.js.map