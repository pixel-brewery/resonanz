import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormFieldDirective, TypographyDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { PasswordBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/password-box';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { SettingsPresenter } from '../presenters/SettingsPresenter';

/** Shared account challenge view for Settings and setup; its parent owns the native operation. */
@Component({
  selector: 'resonanz-assistant-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessagePipe,
    TranslatePipe,
    FormFieldDirective,
    TypographyDirective,
    ButtonComponent,
    CardComponent,
    PasswordBoxComponent,
    TextComponent,
    TextBoxComponent,
  ],
  templateUrl: './AssistantLoginView.html',
  styleUrl: './AssistantLoginView.scss',
})
export class AssistantLoginView {
  protected readonly presenter = inject(SettingsPresenter);
}
