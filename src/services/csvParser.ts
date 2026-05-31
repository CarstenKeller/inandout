import * as FileSystem from 'expo-file-system/legacy';
import { ImportedTransaction } from '../types';
import { generateHash } from './importHash';

// Proper quoted-field CSV split (handles semicolons inside quoted fields)
function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else { inQuotes = !inQuotes; }
    } else if (ch === ';' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

// Handles ING format "45,99-" (trailing sign) as well as "-45,99" (leading sign)
function parseINGAmount(value: string): number {
  let v = value.trim();
  let sign = 1;
  if (v.endsWith('-')) { sign = -1; v = v.slice(0, -1).trim(); }
  else if (v.endsWith('+')) { v = v.slice(0, -1).trim(); }
  else if (v.startsWith('-')) { sign = -1; v = v.slice(1).trim(); }
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return sign * n;
}

const parseGermanDate = (value: string): string => {
  const [day, month, year] = value.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export const parseINGCsvContent = (content: string): ImportedTransaction[] => {
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

  // Use proper CSV split for header too
  const headers = splitCSVLine(lines[headerIndex]).map(h => h.toLowerCase());

  const dateIdx    = headers.findIndex(h =>
    (h.includes('datum') && h.includes('buchung')) ||
    (h.includes('tag')   && h.includes('buchung'))
  );
  const auftrIdx   = headers.findIndex(h => h.includes('auftraggeber') || h.includes('empf'));
  const zweckIdx   = headers.findIndex(h => h.includes('verwendungszweck'));
  const buchtextIdx = headers.findIndex(h => h.includes('buchungstext'));
  const amountIdx  = headers.findIndex(h => h.includes('betrag') && !h.includes('hrung'));

  if (dateIdx === -1 || amountIdx === -1) throw new Error('Pflichtfelder (Datum, Betrag) nicht gefunden');

  const transactions: ImportedTransaction[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length <= amountIdx || !cols[dateIdx]) continue;

    const rawDate   = cols[dateIdx];
    const rawAmount = cols[amountIdx];
    if (!rawDate || !rawAmount) continue;

    // Build description from all meaningful text columns, preserving order:
    // Auftraggeber/Empfänger · Verwendungszweck · Buchungstext
    const textParts = [auftrIdx, zweckIdx, buchtextIdx]
      .filter(idx => idx !== -1)
      .map(idx => cols[idx]?.trim() ?? '')
      .filter(Boolean);
    const description = textParts.join(' · ') || (cols[1] ?? '');

    try {
      const date   = parseGermanDate(rawDate);
      const amount = parseINGAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      transactions.push({
        date, amount: Math.abs(amount), description,
        type: amount >= 0 ? 'income' : 'expense',
        importHash: generateHash(date, Math.abs(amount), description),
      });
    } catch { continue; }
  }

  return transactions;
};

export const parseINGCsv = async (uri: string): Promise<ImportedTransaction[]> => {
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return parseINGCsvContent(content);
};
