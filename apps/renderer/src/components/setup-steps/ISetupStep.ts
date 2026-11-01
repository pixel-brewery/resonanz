/** One localized step in a finite setup workflow. */
export interface ISetupStep {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
