import type { PredictionDraft } from '../../shared/market-draft';

let draft: PredictionDraft | null = null;

/** Guarda o rascunho entre a navegação da tela de mercados e o formulário. */
export function setPredictionDraft(next: PredictionDraft): void {
  draft = next;
}

/** Consome o rascunho uma única vez (o formulário limpa depois de aplicar). */
export function consumePredictionDraft(): PredictionDraft | null {
  const current = draft;
  draft = null;
  return current;
}
