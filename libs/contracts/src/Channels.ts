/**
 * Fixed private transport channels. Renderer callers cannot choose arbitrary channels.
 *
 * @public
 */
export const channels = Object.freeze({ request: 'resonanz:request', event: 'resonanz:event' });
