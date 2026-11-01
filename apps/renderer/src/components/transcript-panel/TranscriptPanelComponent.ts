import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { DurationPipe } from '../../pipes/DurationPipe';
import { MarkerComponent } from '../marker/MarkerComponent';
import { HighlightedTextComponent } from '../highlighted-text/HighlightedTextComponent';
import type { MarkerKind } from '../visualization/VisualizationModels';
import { TranslateFacade } from '../../services/TranslateFacade';
import { transcriptSearch } from './transcriptSearch';
export interface ITranscriptEntry {
  readonly kind?: 'speech' | 'pause';
  readonly id: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly marker?: MarkerKind;
  readonly marked?: boolean;
  readonly annotation?: string;
}
/** Searchable timestamped text. Selection, editing and media remain with the caller. */
@Component({
  selector: 'resonanz-transcript-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormFieldDirective,
    SearchBoxComponent,
    ButtonComponent,
    TranslatePipe,
    DurationPipe,
    MarkerComponent,
    HighlightedTextComponent,
  ],
  templateUrl: './TranscriptPanelComponent.html',
  styleUrl: './TranscriptPanelComponent.scss',
})
export class TranscriptPanelComponent {
  protected readonly intl = inject(TranslateFacade);
  private readonly _query = signal({ text: '' });
  private readonly _searchElement = viewChild('searchBox', { read: ElementRef<HTMLElement> });
  public focusSearch(): void {
    this._searchElement()?.nativeElement.focus();
  }
  public readonly entries = input.required<readonly ITranscriptEntry[]>();
  public readonly query = input('');
  public readonly keepSearchContext = input(false);
  public readonly selectedId = input<string | null>(null);
  public readonly metadata = input('');
  public readonly editing = input(false);
  public readonly showTools = input(true);
  public readonly canEdit = input(true);
  public readonly canTranscribe = input(false);
  public readonly queryChange = output<string>();
  public readonly selected = output<ITranscriptEntry>();
  public readonly editRequested = output<void>();
  public readonly transcribeRequested = output<void>();
  protected readonly searchForm = form(this._query);
  protected readonly searchResult = computed(() =>
    transcriptSearch(this.entries(), this.query(), this.keepSearchContext()),
  );
  protected readonly visible = computed(() => this.searchResult().entries);
  public constructor() {
    effect(() => {
      const text = this.query();
      untracked(() => {
        if (this._query().text !== text) this._query.set({ text });
      });
    });
    effect(() => {
      const text = this._query().text;
      untracked(() => {
        if (text !== this.query()) this.queryChange.emit(text);
      });
    });
  }
  protected request(event: Event, kind: 'edit' | 'transcribe'): void {
    const details = (event.currentTarget as HTMLElement).closest('details');
    if (details) details.open = false;
    if (kind === 'edit') this.editRequested.emit();
    else this.transcribeRequested.emit();
  }
}
