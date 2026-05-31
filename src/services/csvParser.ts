import * as FileSystem from 'expo-file-system/legacy';
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

  // Date: must contain 'datum' or 'tag' (not just 'buchung' which also matches 'buchungstext')
  const dateIdx = headers.findIndex(h =>
    (h.includes('datum') && h.includes('buchung')) ||
    (h.includes('tag') && h.includes('buchung'))
  );
  // Sender/recipient
  const auftrIdx = headers.findIndex(h => h.includes('auftraggeber') || h.includes('empfänger'));
  // Purpose
  const zweckIdx = headers.findIndex(h => h.includes('verwendungszweck'));
  // Transaction type label (e.g. "Lastschrift")
  const buchtextIdx = headers.findIndex(h => h === 'buchungstext' || h.includes('buchungstext'));
  // Amount
  const amountIdx = headers.findIndex(h => h.includes('betrag') && !h.includes('währung'));

  if (dateIdx === -1 || amountIdx === -1) throw new Error('Pflichtfelder (Datum, Betrag) nicht gefunden');

  const transactions: ImportedTransaction[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
    if (cols.length <= amountIdx || !cols[dateIdx]) continue;

    const rawDate = cols[dateIdx];
    const rawAmount = cols[amountIdx];
    if (!rawDate || !rawAmount) continue;

    // Combine all useful text fields — this gives matching much more to work with
    const textParts = [auftrIdx, zweckIdx, buchtextIdx]
      .filter(idx => idx !== -1)
      .map(idx => (cols[idx] ?? '').trim())
      .filter(Boolean);
    const description = textParts.join(' · ') || cols[1] ?? '';

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
