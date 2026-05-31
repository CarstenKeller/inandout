import * as FileSystem from 'expo-file-system';
import { ImportedTransaction } from '../types';
import { generateHash } from './importHash';

const parseGermanAmount = (value: string): number =>
  parseFloat(value.replace(/\./g, '').replace(',', '.'));

const parseGermanDate = (value: string): string => {
  const [day, month, year] = value.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export const parseINGCsv = async (uri: string): Promise<ImportedTransaction[]> => {
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('buchungstag') || lower.includes('buchungsdatum')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) throw new Error('Kein gültiges ING CSV-Format erkannt');

  const headers = lines[headerIndex].split(';').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const dateIdx = headers.findIndex(h => h.includes('buchung'));
  const descIdx = headers.findIndex(h => h.includes('verwendungszweck') || h.includes('auftraggeber'));
  const amountIdx = headers.findIndex(h => h.includes('betrag') && !h.includes('währung'));

  if (dateIdx === -1 || amountIdx === -1) throw new Error('Pflichtfelder nicht gefunden');

  const transactions: ImportedTransaction[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
    if (cols.length <= amountIdx || !cols[dateIdx]) continue;

    const rawDate = cols[dateIdx];
    const rawAmount = cols[amountIdx];
    const description = descIdx !== -1 ? cols[descIdx] : (cols[1] ?? '');

    if (!rawDate || !rawAmount) continue;

    try {
      const date = parseGermanDate(rawDate);
      const amount = parseGermanAmount(rawAmount);
      if (isNaN(amount)) continue;

      transactions.push({
        date,
        amount: Math.abs(amount),
        description,
        type: amount >= 0 ? 'income' : 'expense',
        importHash: generateHash(date, Math.abs(amount), description),
      });
    } catch {
      continue;
    }
  }

  return transactions;
};
