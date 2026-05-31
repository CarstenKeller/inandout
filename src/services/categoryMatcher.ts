import { Category, ImportedTransaction } from '../types';

export interface MatchResult {
  tx: ImportedTransaction;
  categoryId: number | null;
}

export function matchAll(transactions: ImportedTransaction[], categories: Category[]): MatchResult[] {
  return transactions.map(tx => {
    const text = tx.description.toLowerCase();
    for (const cat of categories) {
      if (!cat.keywords) continue;
      const kws = cat.keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length >= 2);
      if (kws.some(kw => text.includes(kw))) {
        return { tx, categoryId: cat.id };
      }
    }
    return { tx, categoryId: null };
  });
}

const STOP_WORDS = new Set([
  'und', 'oder', 'mit', 'von', 'bei', 'für', 'aus', 'nach', 'über',
  'zum', 'zur', 'ein', 'die', 'der', 'das', 'den', 'dem', 'des',
  'gmbh', 'mbh', 'ag', 'kg', 'str', 'ref', 'end', 'to', 'via',
]);

export function suggestKeywords(description: string): string[] {
  return [...new Set(
    description
      .split(/[\s/\\,;:.+\-_|]+/)
      .map(w => w.toLowerCase().replace(/[^a-zäöüß0-9]/g, ''))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
  )].slice(0, 8);
}
