import { type Session } from "./session.ts";
export declare function readLive(session: Session, liveBuffer: number, signal: AbortSignal): AsyncGenerator<Uint8Array, void, undefined>;
