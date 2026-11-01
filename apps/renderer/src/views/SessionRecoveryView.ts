import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { MessagePipe } from '../pipes/MessagePipe';
import { PipelineStepsComponent } from '../components/pipeline-steps/PipelineStepsComponent';
import { TranscriptPanelComponent } from '../components/transcript-panel/TranscriptPanelComponent';

/** Recovery preserves usable source audio/text and offers explicit, account-scoped next actions. */
@Component({
  selector: 'resonanz-session-recovery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    IconComponent,
    TranslatePipe,
    MessagePipe,
    PipelineStepsComponent,
    TranscriptPanelComponent,
  ],
  templateUrl: './SessionRecoveryView.html',
  styleUrl: './SessionRecoveryView.scss',
})
export class SessionRecoveryView {
  protected readonly presenter = inject(SessionPresenter);
  protected readonly shell = inject(ShellPresenter);
  protected readonly intl = inject(TranslateFacade);
  protected readonly assistant = this.shell.assistantName;
  protected readonly status = this.shell.assistantStatus;
  private readonly _now = signal(Date.now());
  protected readonly retryAt = computed(
    () => this.presenter.session()?.pipeline?.analysis?.retryAt ?? null,
  );
  protected readonly retryWait = computed(() => {
    const dueAt = this.retryAt();
    if (!dueAt) return this.intl.t('loc.resonanz.recovery.manualRetry');
    const minutes = Math.max(0, Math.ceil((Date.parse(dueAt) - this._now()) / 60_000));
    return minutes > 0
      ? this.intl.t('loc.resonanz.recovery.retryMinutes', minutes)
      : this.intl.t('loc.resonanz.recovery.checking');
  });
  public constructor() {
    const clock = setInterval(() => this._now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }
  protected readonly stage = computed(() =>
    this.presenter.session()?.pipeline?.transcription?.state === 'failed'
      ? 'transcription'
      : 'analysis',
  );
  protected readonly title = computed(() =>
    this.stage() === 'transcription'
      ? this.intl.t('loc.resonanz.recovery.transcriptionTitle')
      : !this.status()
        ? this.intl.t('loc.resonanz.recovery.assistantAttention', this.assistant())
        : !this.status()?.installed
          ? this.intl.t('loc.resonanz.recovery.assistantMissing', this.assistant())
          : !this.status()?.authenticated
            ? this.intl.t('loc.resonanz.recovery.assistantSignedOut', this.assistant())
            : this.intl.t('loc.resonanz.recovery.assistantAttention', this.assistant()),
  );
  protected readonly error = computed(
    () => this.presenter.session()?.pipeline?.[this.stage()]?.error ?? '',
  );
  protected readonly loginLabel = computed(() =>
    !this.status()
      ? this.intl.t('loc.resonanz.nav.notChecked')
      : this.status()?.authenticated
        ? this.intl.t('loc.resonanz.auth.signedIn')
        : this.intl.t('loc.resonanz.auth.required'),
  );
  protected async retry(): Promise<void> {
    if (this.stage() === 'transcription') await this.presenter.transcribe();
    else await this.presenter.analyze();
  }
  protected copyDiagnostics(): void {
    void this.presenter.copy(
      `${this.assistant()}\n${this.status()?.executable ?? ''}\n${this.loginLabel()}`,
    );
  }
}
