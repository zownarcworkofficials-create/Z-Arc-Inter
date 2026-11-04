import type { MediaHeader } from './Protos.js';
export declare function ticksToMs(ticks: number, timescale: number, round: (value: number) => number): number;
export declare function getDurationMs(mediaHeader: MediaHeader): number;
export declare function getStartMs(mediaHeader: MediaHeader): number;
