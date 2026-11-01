import { SilenceReminderComponent } from '../components/silence-reminder/SilenceReminderComponent';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
// #region Imports
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { RouterLinkActive } from '@angular/router';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ResonanzGlyphComponent } from '../components/glyph/ResonanzGlyphComponent';
import { LanguageService } from '../services/LanguageService';
import { AppearanceService } from '../services/AppearanceService';
import { CapturePanelView } from './CapturePanelView';
import { MiniRecorderProjection } from '../services/MiniRecorderProjection';
import { CaptureUndoDirective } from '../components/mini-recorder/CaptureUndoDirective';
import { WindowToolbar } from '../services/WindowToolbar';
import { NavigationHistory } from '../services/NavigationHistory';
import { StatusBarView } from './StatusBarView';
// #endregion

/**
 * Composes the same Mosaik desktop shell primitives used by Symphony: sidebar, unified window
 * toolbar, routed workspace and the status bar with notifications, playback and updates.
 */
@Component({
  selector: 'resonanz-shell',
  hostDirectives: [CaptureUndoDirective],
  host: { '[class.tray-mode]': 'presenter.nativeTray()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    StatusBarView,
    SilenceReminderComponent,
    TranslatePipe,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    ResonanzGlyphComponent,
    CapturePanelView,
    RouterOutlet,
    FormFieldDirective,
    ButtonComponent,
    TextBoxComponent,
  ],
  templateUrl: './ShellView.html',
  styleUrl: './ShellView.scss',
})
export class ShellView implements OnInit {
  protected readonly intl = inject(TranslateFacade);
  private readonly _appearance = inject(AppearanceService);
  private readonly _language = inject(LanguageService);
  private readonly _miniRecorder = inject(MiniRecorderProjection);
  protected readonly presenter = inject(ShellPresenter);
  protected readonly toolbar = inject(WindowToolbar);
  protected readonly history = inject(NavigationHistory);
  public ngOnInit(): void {
    void this.presenter.initialize();
  }
}
