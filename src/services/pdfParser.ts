import * as FileSystem from 'expo-file-system';
import { ImportedTransaction } from '../types';
import { generateHash } from './importHash';

export const parseINGPdf = async (uri: string): Promise<ImportedTransaction[]> => {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    fullText += content.items.map((item: { str: string }) => item.str).join(' ') + '\n';
  }

  return extractTransactionsFromText(fullText);
};

const extractTransactionsFromText = (text: string): ImportedTransaction[] => {
  const transactions: ImportedTransaction[] = [];
  const linePattern = /(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+([-+]?\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let match;

  while ((match = linePattern.exec(text)) !== null) {
    const [, rawDate, description, rawAmount] = match;
    const [day, month, year] = rawDate.split('.');
    const date = `${year}-${month}-${day}`;
    const amount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));

    if (isNaN(amount)) continue;

    const desc = description.trim();
    transactions.push({
      date,
      amount: Math.abs(amount),
      description: desc,
      type: amount >= 0 ? 'income' : 'expense',
      importHash: generateHash(date, Math.abs(amount), desc),
    });
  }

  return transactions;
};
