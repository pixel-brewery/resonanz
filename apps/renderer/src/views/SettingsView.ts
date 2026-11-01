// #region Imports
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { KbdComponent } from '@pixel-brewery/mosaik-elements-angular/components/kbd';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import {
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { SliderComponent } from '@pixel-brewery/mosaik-elements-angular/components/slider';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { SettingsPresenter } from '../presenters/SettingsPresenter';
import { DesktopApi } from '../services/DesktopApi';
import { TranslateFacade } from '../services/TranslateFacade';
import { UpdateStore } from '../services/UpdateStore';
import { AssistantLoginView } from './AssistantLoginView';
import { StorageBreakdownComponent } from '../components/storage-breakdown/StorageBreakdownComponent';
import type { IStorageSegment } from '../components/storage-breakdown/IStorageSegment';
import { ConfirmationDialogComponent } from '../components/confirmation-dialog/ConfirmationDialogComponent';
// #endregion

/** Native Mosaik fields retain one settings owner while sections scroll independently of the rail. */
@Component({
  selector: 'resonanz-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter],
  imports: [
    MessagePipe,
    TranslatePipe,
    RouterLink,
    FormFieldDirective,
    ButtonComponent,
    IconComponent,
    KbdComponent,
    SearchBoxComponent,
    SegmentComponent,
    SegmentItemComponent,
    SelectComponent,
    SelectItemComponent,
    SliderComponent,
    TextBoxComponent,
    ToggleSwitchComponent,
    AssistantLoginView,
    StorageBreakdownComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './SettingsView.html',
  styleUrl: './SettingsView.scss',
})
export class SettingsView implements OnInit {
  private readonly _api = inject(DesktopApi);
  private readonly _filter = signal({ text: '' });
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(SettingsPresenter);
  protected readonly updates = inject(UpdateStore);
  /** One-line description of the update state for the Updates section. */
  protected readonly updateStatus = computed(() => {
    const state = this.updates.state();
    if (!state) return this.intl.t('loc.resonanz.update.unknown');
    switch (state.kind) {
      case 'disabled':
        return this.intl.t(
          state.reason === 'development'
            ? 'loc.resonanz.update.disabledDevelopment'
            : state.reason === 'unsupported-platform'
              ? 'loc.resonanz.update.disabledPlatform'
              : 'loc.resonanz.update.disabledFeed',
        );
      case 'checking':
        return this.intl.t('loc.resonanz.update.checking');
      case 'available':
        return this.intl.t('loc.resonanz.update.availableTitle', state.targetVersion);
      case 'downloading':
        return this.intl.t(
          'loc.resonanz.update.downloadingProgress',
          Math.round((state.progress ?? 0) * 100),
        );
      case 'ready':
        return this.intl.t('loc.resonanz.update.readyTitle', state.targetVersion);
      case 'failed':
        return this.intl.message(state.message);
      default:
        return state.lastCheckedAt
          ? this.intl.t(
              'loc.resonanz.update.upToDateChecked',
              new Date(state.lastCheckedAt).toLocaleString(this.intl.locale(), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            )
          : this.intl.t('loc.resonanz.update.notChecked');
    }
  });
  protected readonly searchForm = form(this._filter);
  protected readonly activeSection = signal('recording');
  protected readonly connectionOpen = signal(false);
  protected readonly sections = [
    {
      id: 'recording',
      label: 'loc.resonanz.capture.recording',
      search: 'loc.resonanz.settings.recordingSearch',
      icon: 'mic',
    },
    {
      id: 'assistant',
      label: 'loc.resonanz.settings.assistant',
      search: 'loc.resonanz.settings.assistantSearch',
      icon: 'claude',
    },
    {
      id: 'transcription',
      label: 'loc.resonanz.settings.transcription',
      search: 'loc.resonanz.settings.transcriptionSearch',
      icon: 'comment',
    },
    {
      id: 'profile',
      label: 'loc.resonanz.settings.you',
      search: 'loc.resonanz.settings.profileSearch',
      icon: 'person',
    },
    {
      id: 'speech',
      label: 'loc.resonanz.nav.voice',
      search: 'loc.resonanz.settings.speechSearch',
      icon: 'sparkle',
    },
    {
      id: 'storage',
      label: 'loc.resonanz.settings.storage',
      search: 'loc.resonanz.settings.storageSearch',
      icon: 'folder',
    },
    {
      id: 'shortcuts',
      label: 'loc.resonanz.settings.shortcuts',
      search: 'loc.resonanz.settings.shortcutsSearch',
      icon: 'play',
    },
    {
      id: 'appearance',
      label: 'loc.resonanz.settings.appearance',
      search: 'loc.resonanz.settings.appearanceSearch',
      icon: 'settings',
    },
    {
      id: 'updates',
      label: 'loc.resonanz.settings.updates',
      search: 'loc.resonanz.settings.updatesSearch',
      icon: 'refresh',
    },
  ];
  protected readonly visibility = computed(() => {
    const query = this._filter().text.trim().toLocaleLowerCase(this.intl.locale());
    return Object.fromEntries(
      this.sections.map((section) => [
        section.id,
        !query ||
          (this.intl.message(section.label) + ' ' + this.intl.message(section.search))
            .toLocaleLowerCase(this.intl.locale())
            .includes(query),
      ]),
    );
  });
  protected readonly noMatches = computed(() =>
    Object.values(this.visibility()).every((value) => !value),
  );
  protected readonly conversationLanguage = computed(() =>
    this.intl.languageName(this.presenter.form.locale().value()),
  );
  protected readonly recognitionAvailable = computed(() => {
    const capabilities = this.presenter.library.capabilities();
    return (
      !!capabilities?.nativeConversation &&
      capabilities.speechLocales.includes(this.presenter.form.locale().value())
    );
  });
  protected readonly storageSegments = computed<readonly IStorageSegment[]>(() => {
    const usage = this.presenter.library.storage();
    return [
      {
        id: 'recordings',
        label: 'loc.resonanz.settings.storageRecordings',
        bytes: usage?.audioBytes ?? 0,
        variant: 'primary',
      },
      {
        id: 'transcripts',
        label: 'loc.resonanz.settings.storageTranscripts',
        bytes: usage?.transcriptBytes ?? 0,
        variant: 'info',
      },
      {
        id: 'analyses',
        label: 'loc.resonanz.settings.storageAnalyses',
        bytes: (usage?.analysisBytes ?? 0) + (usage?.metadataBytes ?? 0),
        variant: 'highlight',
      },
    ];
  });
  protected readonly shortcuts = computed(() => {
    const modifiers =
      this.presenter.library.capabilities()?.platform === 'darwin' ? ['⌥', '⌘'] : ['Ctrl', 'Alt'];
    return [
      {
        id: 'recording',
        label: 'loc.resonanz.settings.shortcutRecording',
        keys: [...modifiers, 'R'],
      },
      { id: 'mark', label: 'loc.resonanz.settings.shortcutMark', keys: [...modifiers, 'M'] },
      { id: 'pause', label: 'loc.resonanz.settings.shortcutPause', keys: [...modifiers, 'P'] },
      {
        id: 'voice',
        label: 'loc.resonanz.settings.shortcutVoice',
        keys: [...modifiers, this.intl.t('loc.resonanz.settings.spaceKey')],
      },
    ];
  });

  protected scroll(id: string): void {
    this.activeSection.set(id);
    document
      .getElementById('settings-' + id)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  protected chooseProvider(provider: 'codex' | 'claude'): void {
    if (this.presenter.form.provider().value() !== provider)
      this.presenter.selectProvider(provider);
    else if (this.presenter.status()?.authenticated) {
      void this.presenter.testAssistant();
      return;
    }
    this.connectionOpen.set(true);
  }

  protected async reveal(): Promise<void> {
    try {
      await this._api.request('storage.reveal', {});
    } catch (error) {
      this.presenter.library.report(error);
    }
  }

  public ngOnInit(): void {
    void this.presenter.library.refreshStorage();
    void this.presenter
      .initialize()
      .then(() => this.presenter.enableAutosave())
      .catch((error) => this.presenter.library.report(error));
  }
}
