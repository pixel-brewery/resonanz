import type { ISessionPipeline } from './ISessionPipeline.js';
/**
 * Public metadata for the recording library; contains no filesystem paths.
 *
 * @public
 */
export interface ISessionSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: 'recording' | 'conversation';
  readonly status: 'recording' | 'paused' | 'ready' | 'interrupted' | 'processing' | 'error';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly durationMs: number;
  readonly mimeType: string;
  readonly audioBytes: number;
  readonly audioAvailable: boolean;
  readonly starred: boolean;
  readonly tags: readonly string[];
  readonly collectionId: string | null;
  readonly waveform?: readonly number[];
  readonly insightCounts?: {
    readonly decisions: number;
    readonly tasks: number;
    readonly questions: number;
    readonly moments: number;
    readonly forMe?: number;
  };
  readonly transcriptAvailable?: boolean;
  readonly pipeline?: ISessionPipeline;
}
