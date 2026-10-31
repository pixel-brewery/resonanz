// #region Imports
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormFieldDirective,
  TextFormatterDirective,
  TypographyDirective,
} from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { DividerComponent } from '@pixel-brewery/mosaik-elements-angular/components/divider';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DurationPipe } from '../pipes/DurationPipe';
import { SessionPresenter } from '../presenters/SessionPresenter';
// #endregion

/** Displays the saved recording and its transcript-grounded assistant workspace. */
@Component({
  selector: 'resonanz-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionPresenter],
  imports: [
    DatePipe,
    RouterLink,
    FormFieldDirective,
    TextFormatterDirective,
    TypographyDirective,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    DividerComponent,
    SelectComponent,
    SelectItemComponent,
    TextComponent,
    TextBoxComponent,
    DurationPipe,
  ],
  templateUrl: './SessionView.html',
  styleUrl: './SessionView.scss',
})
export class SessionView {
  protected readonly presenter = inject(SessionPresenter);
}
