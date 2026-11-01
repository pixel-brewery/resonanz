import { MessagePipe } from '../pipes/MessagePipe';
import { SilenceReminderComponent } from '../components/silence-reminder/SilenceReminderComponent';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
// #region Imports
import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DurationPipe } from '../pipes/DurationPipe';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { RouterLinkActive } from '@angular/router';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ResonanzGlyphComponent } from '../components/glyph/ResonanzGlyphComponent';
import { LanguageService } from '../services/LanguageService';
import { AppearanceService } from '../services/AppearanceService';
import { CapturePanelView } from './CapturePanelView';
import { MiniRecorderProjection } from '../services/MiniRecorderProjection';
import { CaptureUndoDirective } from '../components/mini-recorder/CaptureUndoDirective';
// #endregion

/** Composes the same Mosaik desktop shell primitives used by Symphony. */
@Component({
  selector: 'resonanz-shell',
  hostDirectives: [CaptureUndoDirective],
  host: { '[class.tray-mode]': 'presenter.nativeTray()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessagePipe,
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
    TextComponent,
    TextBoxComponent,
    DurationPipe,
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
  public ngOnInit(): void {
    void this.presenter.initialize();
  }
}
