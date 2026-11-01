import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
/** Literal text highlighting; user input is never interpreted as markup or a regular expression. */
@Component({
  selector: 'resonanz-highlighted-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './HighlightedTextComponent.html',
  styleUrl: './HighlightedTextComponent.scss',
})
export class HighlightedTextComponent {
  public readonly text = input.required<string>();
  public readonly query = input('');
  protected readonly parts = computed(() => {
    const text = this.text(),
      query = this.query().trim();
    if (!query) return [{ text, highlighted: false }];
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu');
    const parts: { text: string; highlighted: boolean }[] = [];
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index;
      if (index > cursor) parts.push({ text: text.slice(cursor, index), highlighted: false });
      parts.push({ text: match[0], highlighted: true });
      cursor = index + match[0].length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });
    return parts;
  });
}
