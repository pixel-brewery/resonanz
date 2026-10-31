/**
 * Complete host capabilities, as verified by the native runtime.
 *
 * @public
 */
export interface ICapabilities {
  readonly platform: string;
  readonly nativeTranscription: boolean;
  readonly nativeConversation: boolean;
  readonly speechLocales: readonly string[];
  readonly speechVoices: readonly {
    readonly id: string;
    readonly name: string;
    readonly locale: string;
  }[];
  readonly speechMessage?: string;
}
