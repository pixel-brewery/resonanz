// #region Imports
import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  AppComponent,
  FormFieldDirective,
  TypographyDirective,
} from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { DividerComponent } from '@pixel-brewery/mosaik-elements-angular/components/divider';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DurationPipe } from '../pipes/DurationPipe';
import { ShellPresenter } from '../presenters/ShellPresenter';
// #endregion

/** Composes the same Mosaik desktop shell primitives used by Symphony. */
@Component({
  selector: 'resonanz-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterOutlet,
    FormFieldDirective,
    TypographyDirective,
    AppComponent,
    ButtonComponent,
    CardComponent,
    DividerComponent,
    TextComponent,
    TextBoxComponent,
    DurationPipe,
  ],
  templateUrl: './ShellView.html',
  styleUrl: './ShellView.scss',
})
export class ShellView implements OnInit {
  protected readonly presenter = inject(ShellPresenter);
  public ngOnInit(): void {
    void this.presenter.initialize();
  }
}
