// #region Imports
import type { RequestMethod } from './RequestMethod.js';
import type { RequestPayload } from './RequestPayload.js';
import type { ResponsePayload } from './ResponsePayload.js';
import type { AppEvent } from './AppEvent.js';
// #endregion

/**
 * Narrow API exposed by the sandboxed preload; no Electron primitives escape.
 *
 * @public
 */
export interface IResonanzApi {
  request<M extends RequestMethod>(
    method: M,
    payload: RequestPayload<M>,
  ): Promise<ResponsePayload<M>>;
  onEvent(listener: (event: AppEvent) => void): () => void;
}
