import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shares the native application artwork while retaining the standalone mark. */
@Component({
  selector: 'resonanz-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  templateUrl: './ResonanzGlyphComponent.html',
  styleUrl: './ResonanzGlyphComponent.scss',
  host: { 'aria-hidden': 'true' },
})
export class ResonanzGlyphComponent {
  public readonly tile = input(false);
}
