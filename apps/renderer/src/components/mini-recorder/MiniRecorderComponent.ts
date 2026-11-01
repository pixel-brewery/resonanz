import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { LevelMeterComponent } from '../level-meter/LevelMeterComponent';
import { DurationPipe } from '../../pipes/DurationPipe';
import type { IMiniRecorderSnapshot, MiniRecorderMode } from '@resonanz/contracts';
import { MarkerComponent } from '../marker/MarkerComponent';
/** Compact capture controller. It never acquires a microphone or owns recording state. */
@Component({
  selector: 'resonanz-mini-recorder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ButtonComponent, LevelMeterComponent, DurationPipe, MarkerComponent],
  templateUrl: './MiniRecorderComponent.html',
  styleUrl: './MiniRecorderComponent.scss',
})
export class MiniRecorderComponent {
  protected readonly intl = inject(TranslateFacade);
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef);
  private _hovered = false;
  private _focused = false;
  public readonly durationMs = input(0);
  public readonly contextKey = input('');
  public readonly level = input(0);
  public readonly paused = input(false);
  public readonly busy = input(false);
  public readonly feedback = input<IMiniRecorderSnapshot['feedback']>(null);
  public readonly togglePause = output<void>();
  public readonly stop = output<void>();
  public readonly mark = output<void>();
  public readonly expand = output<void>();
  public readonly undo = output<void>();
  public readonly modeChange = output<MiniRecorderMode>();
  protected readonly collapsed = signal(false);
  protected readonly feedbackKey = computed(
    () =>
      (
        ({
          decision: 'loc.resonanz.capture.markeddecision',
          task: 'loc.resonanz.capture.markedtask',
          question: 'loc.resonanz.capture.markedquestion',
          moment: 'loc.resonanz.capture.markedmoment',
        }) as const
      )[this.feedback()?.kind ?? 'moment'],
  );
  public constructor() {
    this.arm();
    effect(() => {
      this.contextKey();
      this.collapsed.set(false);
      this.arm();
    });
    effect(() =>
      this.modeChange.emit(
        this.feedback() ? 'feedback' : this.collapsed() ? 'collapsed' : 'expanded',
      ),
    );
    inject(DestroyRef).onDestroy(() => {
      if (this._timer) clearTimeout(this._timer);
    });
  }
  protected entered(): void {
    this._hovered = true;
    if (this._timer) clearTimeout(this._timer);
    this.collapsed.set(false);
  }
  protected left(): void {
    this._hovered = false;
    this.arm();
  }
  protected focused(): void {
    this._focused = true;
    if (this._timer) clearTimeout(this._timer);
    this.collapsed.set(false);
  }
  protected blurred(event: FocusEvent): void {
    if (
      event.relatedTarget instanceof Node &&
      this._element.nativeElement.contains(event.relatedTarget)
    )
      return;
    this._focused = false;
    this.arm();
  }
  private arm(): void {
    if (this._timer) clearTimeout(this._timer);
    if (!this._hovered && !this._focused)
      this._timer = setTimeout(() => this.collapsed.set(true), 10_000);
  }
}
