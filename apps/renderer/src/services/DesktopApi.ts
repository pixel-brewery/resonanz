// #region Imports
import { Injectable } from '@angular/core';
import type {
  AppEvent,
  IResonanzApi,
  RequestMethod,
  RequestPayload,
  ResponsePayload,
} from '@resonanz/contracts';
// #endregion

/** Connects Angular to the validated sandboxed desktop bridge. */
@Injectable({ providedIn: 'root' })
export class DesktopApi {
  /** Invokes one operation through the preload boundary. */
  public request<M extends RequestMethod>(
    method: M,
    payload: RequestPayload<M>,
  ): Promise<ResponsePayload<M>> {
    return this.bridge().request(method, payload);
  }

  /** Subscribes to validated events and returns their disposal function. */
  public onEvent(listener: (event: AppEvent) => void): () => void {
    return this.bridge().onEvent(listener);
  }

  private bridge(): IResonanzApi {
    const api = (window as Window & { resonanz?: IResonanzApi }).resonanz;
    if (!api) throw new Error('Bitte Resonanz als Desktop-App mit „yarn start“ öffnen.');
    return api;
  }
}
