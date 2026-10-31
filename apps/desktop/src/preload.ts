// #region Imports
import { contextBridge, ipcRenderer } from 'electron';
import {
  channels,
  requestSchemas,
  responseSchemas,
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  appEventSchema,
  type IResonanzApi,
  type RequestMethod,
  type RequestPayload,
  type ResponsePayload,
} from '@resonanz/contracts';
// #endregion

const api: IResonanzApi = {
  async request<M extends RequestMethod>(
    method: M,
    payload: RequestPayload<M>,
  ): Promise<ResponsePayload<M>> {
    const correlationId = crypto.randomUUID();
    const envelope = requestEnvelopeSchema.parse({
      correlationId,
      method,
      payload: requestSchemas[method].parse(payload),
    });
    const response = responseEnvelopeSchema.parse(
      await ipcRenderer.invoke(channels.request, envelope),
    );
    if (response.correlationId !== correlationId)
      throw new Error('Die Antwort gehört nicht zum angefragten Auftrag.');
    if (!response.ok) throw new Error(response.error.message);
    return responseSchemas[method].parse(response.data) as ResponsePayload<M>;
  },
  onEvent(listener) {
    const handle = (_event: Electron.IpcRendererEvent, raw: unknown): void => {
      const event = appEventSchema.safeParse(raw);
      if (event.success) listener(event.data);
    };
    ipcRenderer.on(channels.event, handle);
    return () => ipcRenderer.removeListener(channels.event, handle);
  },
};
contextBridge.exposeInMainWorld('resonanz', Object.freeze(api));
