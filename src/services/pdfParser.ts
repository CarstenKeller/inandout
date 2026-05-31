import * as FileSystem from 'expo-file-system/legacy';
import { inflate } from 'pako';
import { ImportedTransaction } from '../types';
import { generateHash } from './importHash';

const parseGermanAmount = (value: string): number =>
  parseFloat(value.replace(/\./g, '').replace(',', '.'));

const parseGermanDate = (value: string): string => {
  const [day, month, year] = value.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toLatinString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function decodePdfString(raw: string): string {
  return raw
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

function extractStreamTexts(pdfString: string): string[] {
  const results: string[] = [];
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(pdfString)) !== null) {
    const dataStart = m.index + m[0].length;
    const endIdx = pdfString.indexOf('endstream', dataStart);
    if (endIdx === -1) continue;

    let dataEnd = endIdx;
    if (pdfString[dataEnd - 1] === '\n') dataEnd--;
    if (pdfString[dataEnd - 1] === '\r') dataEnd--;

    const lookback = pdfString.substring(Math.max(0, m.index - 600), m.index);
    const isFlate = lookback.includes('/FlateDecode');

    const rawData = pdfString.substring(dataStart, dataEnd);

    if (isFlate) {
      try {
        const bytes = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i) & 0xff;
        results.push(toLatinString(inflate(bytes)));
      } catch {
        // skip undecompressable streams
      }
    } else {
      results.push(rawData);
    }

    streamRe.lastIndex = endIdx + 9;
  }

  return results;
}

function streamToText(stream: string): string {
  let text = '';

  const btEt = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = btEt.exec(stream)) !== null) {
    const block = bm[1];

    // [(text) num ...] TJ
    const tjArr = /\[([\s\S]*?)\]\s*TJ/g;
    let am: RegExpExecArray | null;
    while ((am = tjArr.exec(block)) !== null) {
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let sm: RegExpExecArray | null;
      while ((sm = strRe.exec(am[1])) !== null) text += decodePdfString(sm[1]);
      text += ' ';
    }

    // (text) Tj or (text) '
    const tj = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*[Tj']/g;
    let tm: RegExpExecArray | null;
    while ((tm = tj.exec(block)) !== null) text += decodePdfString(tm[1]) + ' ';

    text += '\n';
  }

  return text;
}

// Lines that signal the start of a non-transaction section (legal notes, contact info, etc.)
const SECTION_STOP_RE = /^(hinweis|rechtlich|ihre?\s+(sicherheit|kontakt|persönlich)|datenschutz|impressum|agb\b|konditionen\b)/i;

// Descriptions that are balance/summary lines, not real transactions
const SKIP_DESC_RE = /(gesamtsaldo|alter\s+(kontostand|saldo)|neuer\s+(kontostand|saldo)|saldo\s*(übertr|am\s+\d|zum\s+\d)|kontostand\s+(am|vom)\s+\d|abschlussbuchung|buchungen?\s+gesamt)/i;

function parseTransactions(text: string): ImportedTransaction[] {
  const DATE_RE = /\b(\d{2}\.\d{2}\.\d{4})\b/;
  const AMT_STANDALONE = /^([+-]?\d{1,3}(?:\.\d{3})*,\d{2})(\s*[+-])?$/;
  const AMT_INLINE = /\s([+-]?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions: ImportedTransaction[] = [];
  let stopParsing = false;

  let i = 0;
  while (i < lines.length && !stopParsing) {
    if (SECTION_STOP_RE.test(lines[i])) { stopParsing = true; break; }

    const dateMatch = DATE_RE.exec(lines[i]);
    if (!dateMatch) { i++; continue; }

    const rawDate = dateMatch[1];
    const descParts: string[] = [];
    let amount: number | null = null;

    const firstRest = lines[i].replace(dateMatch[0], '').trim();
    if (firstRest) descParts.push(firstRest);
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (DATE_RE.test(line)) break;
      if (SECTION_STOP_RE.test(line)) { stopParsing = true; break; }

      if (amount === null) {
        const standalone = AMT_STANDALONE.exec(line);
        if (standalone) {
          const rawAmt = standalone[1];
          const trailingSign = standalone[2]?.trim();
          const sign = rawAmt.startsWith('-') || trailingSign === '-' ? -1 : 1;
          amount = sign * parseGermanAmount(rawAmt.replace(/^[+-]/, ''));
          i++;
          continue; // keep collecting — ING often places Verwendungszweck after the amount
        }

        const inlineAmt = AMT_INLINE.exec(line);
        if (inlineAmt) {
          const before = line.substring(0, line.length - inlineAmt[0].length).trim();
          if (before) descParts.push(before);
          const rawAmt = inlineAmt[1];
          const sign = rawAmt.startsWith('-') ? -1 : 1;
          amount = sign * parseGermanAmount(rawAmt.replace(/^[+-]/, ''));
          i++;
          continue; // keep collecting post-amount lines
        }
      } else {
        // Amount already found — a second standalone amount means next transaction starts
        if (AMT_STANDALONE.exec(line)) break;
      }

      descParts.push(line);
      i++;
    }

    if (amount !== null && descParts.length > 0) {
      const description = descParts.join(' ').trim();
      if (SKIP_DESC_RE.test(description)) continue; // skip balance/summary pseudo-transactions
      try {
        const date = parseGermanDate(rawDate);
        transactions.push({
          date,
          amount: Math.abs(amount),
          description,
          type: amount >= 0 ? 'income' : 'expense',
          importHash: generateHash(date, Math.abs(amount), description),
        });
      } catch { /* skip */ }
    }
  }

  return transactions;
}

export const parseINGPdfFromBase64 = (b64: string): ImportedTransaction[] => {
  const pdfBytes = base64ToUint8Array(b64);
  const pdfString = toLatinString(pdfBytes);

  if (pdfString.includes('/Encrypt')) {
    throw new Error('PDF ist verschlüsselt. Bitte CSV verwenden.');
  }

  const streams = extractStreamTexts(pdfString);
  const allText = streams.map(streamToText).join('\n');
  const transactions = parseTransactions(allText);

  if (transactions.length === 0) {
    throw new Error('Keine Buchungen im PDF erkannt. Bitte prüfe das Format oder verwende CSV.');
  }
  return transactions;
};

export const parseINGPdf = async (uri: string): Promise<ImportedTransaction[]> => {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
  return parseINGPdfFromBase64(b64);
};
