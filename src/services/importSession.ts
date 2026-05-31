import { ImportedTransaction } from '../types';

export interface CategorizedItem { tx: ImportedTransaction; categoryId: number; }
export interface ReviewItem { tx: ImportedTransaction; }

export interface ImportSession {
  autoItems: CategorizedItem[];
  reviewItems: ReviewItem[];
}

let _session: ImportSession | null = null;

export const setImportSession = (s: ImportSession): void => { _session = s; };
export const getImportSession = (): ImportSession | null => _session;
export const clearImportSession = (): void => { _session = null; };
