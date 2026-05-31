import { ImportedTransaction } from '../types';

export const parseINGPdf = async (_uri: string): Promise<ImportedTransaction[]> => {
  throw new Error('PDF-Import wird in dieser Version nicht unterstützt. Bitte CSV verwenden.');
};
