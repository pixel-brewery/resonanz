// #region Imports
import { z } from 'zod';
import {
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  requestSchemas,
  responseSchemas,
  appEventSchema,
} from '@resonanz/contracts';
import { OrchestratorApplication } from './OrchestratorApplication.js';
import { ProcessOwnershipObserver } from './ProcessOwnershipObserver.js';
// #endregion

interface IParentPort {
  on(event: 'message', listener: (message: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}
const parentPort = (process as NodeJS.Process & { parentPort?: IParentPort }).parentPort;
const root = process.env['RESONANZ_DATA_ROOT'];
if (!parentPort || !root) throw new Error('Resonanz background service requires its native host.');
const port = parentPort;
const ownership = new ProcessOwnershipObserver((message) => port.postMessage(message));
const application = new OrchestratorApplication(root, process.env, (event) =>
  port.postMessage({ type: 'app.event', event: appEventSchema.parse(event) }),
);
let closing = false;
const hostRequest = z.object({
  type: z.literal('host.import-file'),
  correlationId: z.uuid(),
  path: z.string().min(1).max(4096),
});

async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await application.dispose();
  ownership.dispose();
  port.postMessage({ type: 'background.stopped' });
  process.exit(0);
}
await application.initialize();
port.on('message', ({ data }) => {
  if (data && typeof data === 'object' && 'type' in data && data.type === 'host.shutdown') {
    void shutdown().catch(() => process.exit(1));
    return;
  }
  const imported = hostRequest.safeParse(data);
  if (imported.success) {
    void application
      .importFile(imported.data.path)
      .then((session) =>
        port.postMessage({ correlationId: imported.data.correlationId, ok: true, data: session }),
      )
      .catch((cause: unknown) =>
        port.postMessage({
          correlationId: imported.data.correlationId,
          ok: false,
          error: {
            code: 'IMPORT_FAILED',
            message: cause instanceof Error ? cause.message : 'loc.resonanz.error.import',
          },
        }),
      );
    return;
  }
  const envelope = requestEnvelopeSchema.safeParse(data);
  if (!envelope.success || closing) return;
  const { correlationId, method, payload } = envelope.data;
  void (async () => {
    try {
      const input = requestSchemas[method].parse(payload);
      const result = await application.request(method, input);
      const output = responseSchemas[method].parse(result);
      port.postMessage(responseEnvelopeSchema.parse({ correlationId, ok: true, data: output }));
    } catch (cause) {
      port.postMessage(
        responseEnvelopeSchema.parse({
          correlationId,
          ok: false,
          error: {
            code: 'REQUEST_FAILED',
            message:
              cause instanceof z.ZodError
                ? 'loc.resonanz.error.responseFormat'
                : cause instanceof Error
                  ? cause.message.slice(0, 2000)
                  : 'loc.resonanz.error.runFailed',
          },
        }),
      );
    }
  })();
});
process.once('SIGTERM', () => void shutdown().catch(() => process.exit(1)));
process.once('SIGINT', () => void shutdown().catch(() => process.exit(1)));
port.postMessage({ type: 'background.ready' });
