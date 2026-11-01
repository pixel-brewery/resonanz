import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  inject,
} from '@angular/core';
/** Shows actual incoming level samples; silence remains still. */
@Component({
  imports: [TranslatePipe],
  selector: 'resonanz-level-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './LevelMeterComponent.html',
  styleUrl: './LevelMeterComponent.scss',
})
export class LevelMeterComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly level = input(0);
  public readonly paused = input(false);
  public readonly count = input(40);
  private readonly _history = signal<readonly number[]>(Array.from({ length: 40 }, () => 0));
  protected readonly samples = computed(() =>
    this._history().slice(-Math.max(1, Math.min(40, Math.round(this.count()) || 40))),
  );
  public constructor() {
    effect(() => {
      const level = this.level();
      if (!this.paused())
        this._history.update((values) => [
          ...values.slice(1),
          Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)),
        ]);
    });
  }
}
