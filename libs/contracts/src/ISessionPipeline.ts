/** Durable processing state. A percentage is present only when an owner reports one. */
export interface IProcessingStep {
  readonly state: 'pending' | 'running' | 'done' | 'failed';
  readonly progress?: number;
  readonly error?: string;
  readonly provider?: string;
  /** Host-owned next automatic analysis attempt; absent when no retry is scheduled. */
  readonly retryAt?: string;
}
export interface ISessionPipeline {
  readonly transcription?: IProcessingStep;
  readonly analysis?: IProcessingStep;
}
