import { describe, expect, it } from 'vitest';
import { SpokenSentenceBuffer } from './SpokenSentenceBuffer';

describe('SpokenSentenceBuffer', () => {
  it('joins streamed fragments and emits each completed sentence once', () => {
    const buffer = new SpokenSentenceBuffer();
    expect(buffer.append('Guten')).toEqual([]);
    expect(buffer.append(' Morgen. Wie ')).toEqual(['Guten Morgen.']);
    expect(buffer.append('geht es? ')).toEqual(['Wie geht es?']);
    expect(buffer.append('Alles gut')).toEqual([]);
    expect(buffer.finish()).toEqual(['Alles gut']);
    expect(buffer.finish()).toEqual([]);
  });

  it('removes formatting while retaining useful spoken link text', () => {
    const buffer = new SpokenSentenceBuffer();
    expect(buffer.append('## Überblick\n- **Prüfe** den [Plan](https://example.test). ')).toEqual([
      'Überblick',
      'Prüfe den Plan.',
    ]);
  });

  it('bounds long unpunctuated output without damaging Unicode or dropping text', () => {
    const buffer = new SpokenSentenceBuffer();
    const input = 'x'.repeat(3_999) + '🎙' + 'y'.repeat(4_001);
    const chunks = [...buffer.append(input), ...buffer.finish()];
    expect(chunks.every((chunk) => chunk.length <= 4_000)).toBe(true);
    expect(chunks.join('')).toBe(input);
    expect(chunks[0]).toHaveLength(3_999);
  });
});
