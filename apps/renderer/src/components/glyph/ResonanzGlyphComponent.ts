import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The supplied Resonanz mark, in the handoff's 24-unit coordinate system. */
@Component({
  selector: 'resonanz-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ResonanzGlyphComponent.html',
  styleUrl: './ResonanzGlyphComponent.scss',
  host: { 'aria-hidden': 'true' },
})
export class ResonanzGlyphComponent {
  public readonly tile = input(false);
}
