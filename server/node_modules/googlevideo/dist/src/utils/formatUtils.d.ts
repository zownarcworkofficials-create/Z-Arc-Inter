import { type MediaHeader } from './Protos.js';
import type { CreateFormatKeyInput, FormatStream, SabrFormat } from '../types/shared.js';
import type { SabrRequestMetadata } from '../types/sabrStreamingAdapterTypes.js';
export declare const MAX_INT32_VALUE = "2147483647";
export declare enum EnabledTrackTypes {
    VIDEO_AND_AUDIO = 0,
    AUDIO_ONLY = 1,
    VIDEO_ONLY = 2
}
export declare function describeMissingFormat(type: 'video' | 'audio', formatOption: number | SabrFormat | ((formats: SabrFormat[]) => SabrFormat | undefined) | undefined, formats: SabrFormat[]): string;
export declare function chooseFormat(formats: SabrFormat[], formatOption: number | SabrFormat | ((formats: SabrFormat[]) => SabrFormat | undefined) | undefined, preferences: {
    quality?: string;
    language?: string;
    container?: 'webm' | 'mp4';
    preferredVideoCodec?: 'h264' | 'vp9' | 'av1';
    preferredAudioCodec?: 'aac' | 'opus';
    voiceBoost?: boolean;
    dynamicRangeCompression?: boolean;
    superResolution?: boolean;
    hdr?: boolean;
    isAudio: boolean;
}): SabrFormat | undefined;
export declare function buildSabrFormat(formatStream: FormatStream): SabrFormat;
export declare function createFormatKey(input: CreateFormatKeyInput): string;
/**
 * Creates a segment cache key.
 * @param mediaHeader - The MediaHeader object.
 * @param format - Format object (needed for init segments.)
 */
export declare function createSegmentCacheKey(mediaHeader: MediaHeader, format?: SabrFormat): string;
/**
 * Creates a cache key from request metadata.
 * @returns A string key for caching segments.
 */
export declare function createSegmentCacheKeyFromMetadata(requestMetadata: SabrRequestMetadata): string;
/**
 * Generates a unique format ID based on the SabrFormat properties.
 * @param format - The SabrFormat object.
 */
export declare function getUniqueFormatId(format: SabrFormat): string;
