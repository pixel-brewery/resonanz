/**
 * Groups local-assistant text deltas into bounded, speakable sentences.
 *
 * @public
 */
export class SpokenSentenceBuffer {
  // #region Fields

  private _pending = '';

  // #endregion

  // #region Ctor
  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Extracts completed sentences without repeating earlier streamed text.
   *
   * @public
   */
  public append(delta: string): readonly string[] {
    this._pending += delta;
    const sentences: string[] = [];

    while (this._pending.length > 0) {
      const boundary = /[.!?]+["»”')\]]*\s+|\n+/u.exec(this._pending);
      let end = boundary === null ? -1 : boundary.index + boundary[0].length;

      if (end < 0 || end > 4_000) {
        if (this._pending.length <= 4_000) break;
        const space = this._pending.lastIndexOf(' ', 3_500);
        end = space > 0 ? space + 1 : 4_000;
        const previous = this._pending.charCodeAt(end - 1);
        const next = this._pending.charCodeAt(end);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) --end;
      }

      const sentence = this.plainText(this._pending.slice(0, end));
      this._pending = this._pending.slice(end);
      if (sentence.length > 0) sentences.push(sentence);
    }

    return sentences;
  }

  /**
   * Releases a final sentence even when the model omitted terminal punctuation.
   *
   * @public
   */
  public finish(): readonly string[] {
    const sentences = [...this.append('')];
    const last = this.plainText(this._pending);
    this._pending = '';
    if (last.length > 0) sentences.push(last);
    return sentences;
  }

  private plainText(value: string): string {
    return value
      .replace(/^\s*(?:#{1,6}|[-*+]\s|\d+\.\s)/gmu, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/\*\*|__|`/gu, '')
      .trim();
  }

  // #endregion
}
