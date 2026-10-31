// #region Imports
import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective, TypographyDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';
import { PasswordBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/password-box';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { SettingsPresenter } from '../presenters/SettingsPresenter';
// #endregion

/** Uses native Mosaik fields with Angular Signal Forms for all editable settings. */
@Component({
  selector: 'resonanz-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter],
  imports: [
    FormFieldDirective,
    TypographyDirective,
    ButtonComponent,
    CardComponent,
    CheckboxComponent,
    PasswordBoxComponent,
    SelectComponent,
    SelectItemComponent,
    TextComponent,
    TextBoxComponent,
  ],
  templateUrl: './SettingsView.html',
  styleUrl: './SettingsView.scss',
})
export class SettingsView implements OnInit {
  protected readonly presenter = inject(SettingsPresenter);
  public ngOnInit(): void {
    void this.presenter.initialize();
  }
}
