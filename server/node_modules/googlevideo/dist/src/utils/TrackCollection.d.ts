import type { TrackState } from '../types/sabrStreamTypes.js';
import type { BufferedRange, FormatId } from './Protos.js';
import { EnabledTrackTypes } from './formatUtils.js';
import { Track } from './Track.js';
export declare class TrackCollection {
    readonly video: Track;
    readonly audio: Track;
    readonly initializedTracksMap: Map<string, Track>;
    get needsDrain(): boolean;
    get buffered(): number;
    get bufferedRanges(): BufferedRange[];
    get initializedTracks(): MapIterator<Track>;
    get initializationFormatIds(): FormatId[];
    get livePlaybackLatencyMs(): number | undefined;
    initialize(type: 'video' | 'audio', metadata: TrackState): void;
    getInitializedTrack(formatKey: string): Track | undefined;
    endOfStreamReached(enabledTrackTypes: EnabledTrackTypes): boolean;
    snapshot(): TrackState[];
    error(err?: string | Error): void;
    close(): void;
}
