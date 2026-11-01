import { MessagePipe } from '../pipes/MessagePipe';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  isUserAssignee,
  type IInsightClaim,
  type IQuestionMessage,
  type ITranscriptEvidence,
} from '@resonanz/contracts';
import { translate } from '@resonanz/intl';
import { RouterLink } from '@angular/router';
import { FormFieldDirective, TextFormatterDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { PromptBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/prompt-box';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { EvidenceChipComponent } from '../components/evidence-chip/EvidenceChipComponent';
import { EvidencePanelComponent } from '../components/evidence-panel/EvidencePanelComponent';
import { SegmentedTabsComponent } from '../components/segmented-tabs/SegmentedTabsComponent';
import { MarkerComponent } from '../components/marker/MarkerComponent';
import {
  AnswerGapComponent,
  type IAnswerGapRelated,
} from '../components/answer-gap/AnswerGapComponent';
@Component({
  selector: 'resonanz-session-questions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessagePipe,
    TranslatePipe,
    RouterLink,
    FormFieldDirective,
    TextFormatterDirective,
    ButtonComponent,
    IconComponent,
    PromptBoxComponent,
    TextComponent,
    EvidenceChipComponent,
    EvidencePanelComponent,
    SegmentedTabsComponent,
    MarkerComponent,
    AnswerGapComponent,
  ],
  templateUrl: './SessionQuestionsView.html',
  styleUrl: './SessionQuestionsView.scss',
})
export class SessionQuestionsView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(SessionPresenter);
  protected readonly contextTabs = [
    { id: 'transcript', label: 'loc.resonanz.question.transcriptOnly' },
    { id: 'transcriptAndMoments', label: 'loc.resonanz.settings.contextMarkers' },
  ];
  protected readonly suggestions = [
    'loc.resonanz.question.whatDecided',
    'loc.resonanz.question.assigned',
    'loc.resonanz.question.openQuestions',
  ];
  protected setContext(value: string): void {
    this.presenter.context.set(value === 'transcript' ? 'transcript' : 'transcriptAndMoments');
  }
  protected async submitQuestion(text: string): Promise<void> {
    this.presenter.setQuestion(text);
    const admitted = await this.presenter.ask();
    if (!admitted && !this.presenter.questionForm.text().value().trim())
      this.presenter.setQuestion(text);
  }
  protected proofCount(claims: readonly { evidence: readonly unknown[] }[]): number {
    return claims.filter((c) => c.evidence.length > 0).length;
  }
  protected relatedTitle(evidence: ITranscriptEvidence): string {
    return (
      this.presenter
        .chapters()
        .find((chapter) => evidence.atMs >= chapter.startMs && evidence.atMs < chapter.endMs)
        ?.title ?? evidence.quote
    );
  }
  protected assignedName(message: IQuestionMessage): string {
    const settings = this.presenter.library.settings();
    const name = settings.userName?.trim() ?? '';
    const aliases = settings.addressedAs ?? '';
    const question = this.presenter.questionFor(message);
    const taskQuestions = ['en', 'de'].flatMap((language) => [
      translate(language === 'de' ? 'de' : 'en', 'loc.resonanz.question.myTasks'),
      translate(language === 'de' ? 'de' : 'en', 'loc.resonanz.question.assigned'),
    ]);
    if (!taskQuestions.includes(question)) return '';
    const quotes =
      message.answer?.claims
        .filter(
          (claim) =>
            this.claimKind(claim) === 'task' || isUserAssignee(claim.assignee, name, aliases),
        )
        .flatMap((claim) => claim.evidence.map((evidence) => evidence.quote)) ?? [];
    return (
      [name, ...aliases.split(',')]
        .map((value) => value.trim())
        .filter(Boolean)
        .find((value) => {
          const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
          const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
          return quotes.some((quote) => pattern.test(quote));
        }) ?? ''
    );
  }
  protected answerProvider(message: IQuestionMessage): string {
    const provider = 'provider' in message ? message.provider : null;
    return provider === 'claude'
      ? 'Claude Code'
      : provider === 'codex'
        ? 'Codex'
        : this.intl.t('loc.resonanz.settings.assistantLocal');
  }
  protected answerIcon(message: IQuestionMessage): string {
    const provider = 'provider' in message ? message.provider : null;
    return provider === 'claude' ? 'claude' : provider === 'codex' ? 'openai' : 'assistant';
  }
  protected claimKind(claim: IInsightClaim): 'decision' | 'task' | 'question' | 'moment' {
    const analysis = this.presenter.session()?.analysis;
    const ids = new Set(claim.evidence.map((evidence) => evidence.segmentId));
    if (
      analysis?.decisions.some((item) =>
        item.evidence.some((evidence) => ids.has(evidence.segmentId)),
      )
    )
      return 'decision';
    if (
      analysis?.tasks.some((item) => item.evidence.some((evidence) => ids.has(evidence.segmentId)))
    )
      return 'task';
    if (
      analysis?.openQuestions.some((item) =>
        item.evidence.some((evidence) => ids.has(evidence.segmentId)),
      )
    )
      return 'question';
    return 'moment';
  }
  protected gapDescription(message: IQuestionMessage): string {
    return message.answer?.claims.map((claim) => claim.text).join('\n\n') || message.text;
  }
  protected gapRelated(message: IQuestionMessage): IAnswerGapRelated | null {
    const evidence = message.answer?.related[0];
    return evidence
      ? {
          id: evidence.segmentId,
          title: this.relatedTitle(evidence),
          atMs: evidence.atMs,
          selected: this.presenter.selectedEvidence()?.segmentId === evidence.segmentId,
        }
      : null;
  }
  protected selectGapRelated(message: IQuestionMessage): void {
    const evidence = message.answer?.related[0];
    if (evidence) void this.presenter.selectEvidence(evidence);
  }
}
