/**
 * The InnerTube clients `Ytdl` can ask, for the `clients` option.
 * @enum
 */
export declare const Client: {
    /** Apple Vision Pro app. Needs no player script. */
    readonly VisionOS: "visionos";
    /** Embedded player on a third-party page. Accepts a cookie. */
    readonly WebEmbedded: "web_embedded";
    /** Samsung Tizen TV app. Accepts a cookie. */
    readonly Tv: "tv";
    /** Mobile website. Accepts a cookie; needs a PO token. */
    readonly Mweb: "mweb";
    /** YouTube Studio. Needs a cookie and a PO token. */
    readonly WebCreator: "web_creator";
    /** YouTube Music website. Needs a PO token; plays songs, not other videos. */
    readonly WebMusic: "web_music";
};
export type Client = (typeof Client)[keyof typeof Client];
/** The clients a `Ytdl` asks without a `clients` option, in order. */
export declare const DEFAULT_CLIENTS: readonly Client[];
export interface ClientDefinition {
    readonly name: string;
    readonly nameId: number;
    readonly version: string;
    readonly userAgent: string | undefined;
    readonly context: Readonly<Record<string, string | number>>;
    readonly origin: string;
    readonly needsPlayer: boolean;
    readonly poToken: boolean;
    readonly account: "none" | "optional" | "required";
    /** Asks with the visitor data and host flags of the video's embed page. */
    readonly embedded: boolean;
}
export declare const YOUTUBE_ORIGIN = "https://www.youtube.com";
export declare const BROWSER: Readonly<Record<string, string>>;
export declare function userAgentHeader(client: Client | ClientDefinition): Readonly<Record<string, string>>;
export declare const WEB_MUSIC: ClientDefinition;
export declare const CLIENTS: Readonly<Record<Client, ClientDefinition>>;
export declare const WEB: ClientDefinition;
