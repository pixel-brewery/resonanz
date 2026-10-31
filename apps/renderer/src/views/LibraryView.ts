// #region Imports
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormFieldDirective, TypographyDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DurationPipe } from '../pipes/DurationPipe';
import { LibraryPresenter } from '../presenters/LibraryPresenter';
// #endregion

/** Displays real recordings, their collections and first-use capture actions. */
@Component({
  selector: 'resonanz-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LibraryPresenter],
  imports: [
    DatePipe,
    RouterLink,
    FormFieldDirective,
    TypographyDirective,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    IconComponent,
    SearchBoxComponent,
    TextComponent,
    TextBoxComponent,
    DurationPipe,
  ],
  templateUrl: './LibraryView.html',
  styleUrl: './LibraryView.scss',
})
export class LibraryView {
  protected readonly presenter = inject(LibraryPresenter);
}
