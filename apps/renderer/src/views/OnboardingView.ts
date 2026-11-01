import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import {
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { LevelMeterComponent } from '../components/level-meter/LevelMeterComponent';
import { SetupStepsComponent } from '../components/setup-steps/SetupStepsComponent';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { SettingsPresenter } from '../presenters/SettingsPresenter';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { MicrophonePreview } from '../services/MicrophonePreview';
import { TranslateFacade } from '../services/TranslateFacade';
import { AssistantLoginView } from './AssistantLoginView';

/** Three explicit setup steps reuse the actual account, preference and microphone owners. */
@Component({
  selector: 'resonanz-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter, MicrophonePreview],
  imports: [
    MessagePipe,
    TranslatePipe,
    RouterLink,
    FormFieldDirective,
    ButtonComponent,
    IconComponent,
    SegmentComponent,
    SegmentItemComponent,
    SelectComponent,
    SelectItemComponent,
    TextBoxComponent,
    ToggleSwitchComponent,
    LevelMeterComponent,
    SetupStepsComponent,
    AssistantLoginView,
  ],
  templateUrl: './OnboardingView.html',
  styleUrl: './OnboardingView.scss',
})
export class OnboardingView implements OnInit {
  private readonly _router = inject(Router);
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(SettingsPresenter);
  protected readonly preview = inject(MicrophonePreview);
  protected readonly shell = inject(ShellPresenter);
  protected readonly step = signal(0);
  protected readonly availableThrough = signal(0);
  protected readonly transitioning = signal(false);
  protected readonly steps = [
    {
      id: 'audio',
      label: 'loc.resonanz.common.audio',
      description: 'loc.resonanz.onboarding.audioStep',
    },
    {
      id: 'assistant',
      label: 'loc.resonanz.settings.assistant',
      description: 'loc.resonanz.onboarding.assistantStep',
    },
    {
      id: 'start',
      label: 'loc.resonanz.onboarding.start',
      description: 'loc.resonanz.onboarding.startStep',
    },
  ];
  protected readonly assistants = computed(() => {
    const status = this.presenter.status();
    const selection = this.presenter.form.provider().value();
    return (
      [
        { id: 'claude', name: 'Claude Code', icon: 'claude' },
        { id: 'codex', name: 'Codex', icon: 'openai' },
      ] as const
    ).map((provider) => {
      const installation = this.shell.installations().find((item) => item.provider === provider.id);
      const account = status?.provider === provider.id ? status : null;
      const installed = account?.installed ?? installation?.installed ?? null;
      const test = selection === provider.id ? this.presenter.testResult() : null;
      return {
        ...provider,
        selected: selection === provider.id,
        installed,
        installation:
          installed === null
            ? 'loc.resonanz.onboarding.unchecked'
            : installed
              ? 'loc.resonanz.onboarding.installed'
              : 'loc.resonanz.auth.notInstalled',
        authenticated: account?.authenticated ?? null,
        account: account
          ? account.authenticated
            ? 'loc.resonanz.auth.signedIn'
            : 'loc.resonanz.auth.required'
          : 'loc.resonanz.onboarding.unchecked',
        tested: !!test,
        test:
          test ??
          (account?.authenticated
            ? 'loc.resonanz.onboarding.notTested'
            : 'loc.resonanz.onboarding.afterSignIn'),
      };
    });
  });

  public ngOnInit(): void {
    void this.presenter.initialize().catch((error) => this.presenter.library.report(error));
  }

  protected async testMicrophone(): Promise<void> {
    try {
      if (this.preview.active()) await this.preview.stop();
      else await this.preview.start(this.presenter.capture.deviceId());
    } catch (error) {
      this.presenter.library.report(error);
    }
  }

  /** Navigation never leaves an owned microphone probe running in another step. */
  protected async goToStep(index: number): Promise<void> {
    if (
      this.transitioning() ||
      index < 0 ||
      index > this.availableThrough() ||
      !Number.isInteger(index)
    )
      return;
    this.transitioning.set(true);
    try {
      if (index !== 0) await this.preview.stop();
      this.step.set(index);
    } catch (error) {
      this.presenter.library.report(error);
    } finally {
      this.transitioning.set(false);
    }
  }

  protected async next(): Promise<void> {
    if (this.transitioning()) return;
    this.transitioning.set(true);
    try {
      await this.preview.stop();
      if (!(await this.presenter.save())) return;
      if (this.step() < 2) {
        const index = this.step() + 1;
        this.availableThrough.update((available) => Math.max(index, available));
        this.step.set(index);
        return;
      }
      await this.presenter.library.saveSettings({ onboardingComplete: true });
      await this._router.navigate(['/']);
      this.shell.openCapture();
    } catch (error) {
      this.presenter.library.report(error);
    } finally {
      this.transitioning.set(false);
    }
  }
}
