import { type Session } from "./session.ts";
export declare function readDash(session: Session, liveBuffer: number, signal: AbortSignal): AsyncGenerator<Uint8Array, void, undefined>;
