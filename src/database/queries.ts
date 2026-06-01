import { db } from './database';
import {
  Account, Transaction, Category, MonthlyBalance, CategoryBalance,
  ImportedTransaction, ImportSessionRecord, ImportItemRecord,
} from '../types';

// ── Accounts ─────────────────────────────────────────────────────────────────

export const getAccounts = (): Account[] =>
  db.getAllSync<Account>('SELECT * FROM accounts ORDER BY id');

export const createAccount = (name: string, color: string, iban?: string): number => {
  const r = db.runSync(
    'INSERT INTO accounts (name, color, iban) VALUES (?, ?, ?)',
    [name, color, iban ?? null]
  );
  return r.lastInsertRowId;
};

export const getUnlinkedTransactionCount = (): number =>
  db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM transactions WHERE accountId IS NULL AND isManual = 0"
  )?.count ?? 0;

export const migrateTransactionsToAccount = (accountId: number): void => {
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE transactions SET accountId = ? WHERE accountId IS NULL AND isManual = 0',
      [accountId]
    );
    db.runSync(
      'UPDATE import_sessions SET account_id = ? WHERE account_id IS NULL',
      [accountId]
    );
  });
};

// ── Import sessions ──────────────────────────────────────────────────────────

export const createImportSession = (
  filename: string, fileHash: string, totalCount: number, accountId: number | null = null
): number => {
  const r = db.runSync(
    'INSERT INTO import_sessions (filename, file_hash, imported_at, total_count, account_id) VALUES (?, ?, ?, ?, ?)',
    [filename, fileHash, new Date().toISOString(), totalCount, accountId]
  );
  return r.lastInsertRowId;
};

export const findSessionByHash = (fileHash: string): ImportSessionRecord | null =>
  db.getFirstSync<ImportSessionRecord>(
    'SELECT * FROM import_sessions WHERE file_hash = ?', [fileHash]
  ) ?? null;

export const getImportSessions = (): ImportSessionRecord[] =>
  db.getAllSync<ImportSessionRecord>(
    'SELECT * FROM import_sessions ORDER BY imported_at DESC'
  );

export const deleteImportSession = (id: number): void => {
  db.runSync('DELETE FROM import_sessions WHERE id = ?', [id]);
};

export const deleteImportSessionWithTransactions = (id: number): void => {
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM transactions WHERE importHash IN (
         SELECT import_hash FROM import_items WHERE session_id = ?
       )`,
      [id]
    );
    db.runSync('DELETE FROM import_sessions WHERE id = ?', [id]);
  });
};

export const updateSessionCounts = (sessionId: number): void => {
  const row = db.getFirstSync<{ a: number; s: number; sk: number }>(
    `SELECT
      SUM(CASE WHEN status='auto'     THEN 1 ELSE 0 END) as a,
      SUM(CASE WHEN status='assigned' THEN 1 ELSE 0 END) as s,
      SUM(CASE WHEN status='skipped'  THEN 1 ELSE 0 END) as sk
     FROM import_items WHERE session_id = ?`,
    [sessionId]
  );
  db.runSync(
    'UPDATE import_sessions SET auto_count=?, assigned_count=?, skipped_count=? WHERE id=?',
    [row?.a ?? 0, row?.s ?? 0, row?.sk ?? 0, sessionId]
  );
};

// ── Import items ─────────────────────────────────────────────────────────────

export const bulkInsertImportItems = (
  sessionId: number,
  items: Array<{ tx: ImportedTransaction; status: 'pending' | 'auto'; categoryId: number | null }>
): void => {
  const session = db.getFirstSync<{ account_id: number | null }>(
    'SELECT account_id FROM import_sessions WHERE id = ?', [sessionId]
  );
  const accountId = session?.account_id ?? null;

  db.withTransactionSync(() => {
    for (const { tx, status, categoryId } of items) {
      db.runSync(
        'INSERT INTO import_items (session_id, import_hash, date, amount, description, type, status, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sessionId, tx.importHash, tx.date, tx.amount, tx.description, tx.type, status, categoryId ?? null]
      );
      if (categoryId !== null && !hashExists(tx.importHash)) {
        db.runSync(
          'INSERT INTO transactions (date, amount, description, categoryId, type, importHash, isManual, recurrence, accountId) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
          [tx.date, tx.amount, tx.description, categoryId, tx.type, tx.importHash, 'once', accountId]
        );
      }
    }
  });
};

export const getPendingImportItems = (sessionId: number): ImportItemRecord[] =>
  db.getAllSync<ImportItemRecord>(
    "SELECT * FROM import_items WHERE session_id = ? AND status = 'pending' ORDER BY id",
    [sessionId]
  );

export const assignImportItem = (
  item: ImportItemRecord,
  status: 'assigned' | 'auto' | 'skipped',
  categoryId: number | null,
  excluded = false
): void => {
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE import_items SET status=?, category_id=? WHERE id=?',
      [status, categoryId ?? null, item.id]
    );
    if (categoryId !== null && !hashExists(item.import_hash)) {
      const accountId = db.getFirstSync<{ account_id: number | null }>(
        'SELECT account_id FROM import_sessions WHERE id = ?',
        [item.session_id]
      )?.account_id ?? null;
      db.runSync(
        'INSERT INTO transactions (date, amount, description, categoryId, type, importHash, isManual, recurrence, accountId, isExcluded) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [item.date, item.amount, item.description, categoryId, item.type, item.import_hash, 'once', accountId, excluded ? 1 : 0]
      );
    }
  });
};

export const setTransactionExcluded = (id: number, excluded: boolean): void => {
  db.runSync('UPDATE transactions SET isExcluded=? WHERE id=?', [excluded ? 1 : 0, id]);
};

export const getCategories = (): Promise<Category[]> =>
  Promise.resolve(db.getAllSync<Category>('SELECT * FROM categories ORDER BY name'));

export const addCategory = (category: Omit<Category, 'id'>): Promise<number> => {
  const result = db.runSync(
    'INSERT INTO categories (name, color, icon, type, keywords) VALUES (?, ?, ?, ?, ?)',
    [category.name, category.color, category.icon, category.type, category.keywords ?? '']
  );
  return Promise.resolve(result.lastInsertRowId);
};

export const deleteCategory = (id: number): Promise<void> => {
  db.runSync('DELETE FROM categories WHERE id = ?', [id]);
  return Promise.resolve();
};

export const updateCategory = (
  id: number,
  category: Omit<Category, 'id'>
): Promise<void> => {
  db.runSync(
    'UPDATE categories SET name=?, color=?, icon=?, type=?, keywords=?, amount_rules=? WHERE id=?',
    [category.name, category.color, category.icon, category.type, category.keywords ?? '', category.amount_rules ?? '', id]
  );
  return Promise.resolve();
};

export const updateCategoryKeywords = (id: number, keywords: string): Promise<void> => {
  db.runSync('UPDATE categories SET keywords=? WHERE id=?', [keywords, id]);
  return Promise.resolve();
};

export const updateCategoryAmountRules = (id: number, rules: string): Promise<void> => {
  db.runSync('UPDATE categories SET amount_rules=? WHERE id=?', [rules, id]);
  return Promise.resolve();
};

export const getTransactions = (month?: string): Promise<Transaction[]> => {
  const base = `
    SELECT t.*, c.name as categoryName, c.color as categoryColor,
           a.name as accountName, a.color as accountColor
    FROM transactions t
    LEFT JOIN categories c ON t.categoryId = c.id
    LEFT JOIN accounts a ON t.accountId = a.id
  `;
  const rows = month
    ? db.getAllSync<Transaction>(
        base + "WHERE strftime('%Y-%m', t.date) = ? ORDER BY t.isManual ASC, t.date DESC",
        [month]
      )
    : db.getAllSync<Transaction>(
        base + 'ORDER BY t.isManual ASC, t.date DESC'
      );
  return Promise.resolve(rows);
};

export const getManualTransactions = (): Promise<Transaction[]> =>
  Promise.resolve(
    db.getAllSync<Transaction>(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor
       FROM transactions t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE t.isManual = 1
       ORDER BY t.date DESC`
    )
  );

export const addTransaction = (
  transaction: Omit<Transaction, 'id' | 'categoryName' | 'categoryColor'>
): Promise<number> => {
  const result = db.runSync(
    'INSERT INTO transactions (date, amount, description, categoryId, type, importHash, isManual, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      transaction.date,
      transaction.amount,
      transaction.description,
      transaction.categoryId,
      transaction.type,
      transaction.importHash ?? null,
      transaction.isManual ?? 0,
      transaction.recurrence ?? 'once',
    ]
  );
  return Promise.resolve(result.lastInsertRowId);
};

export const updateTransaction = (
  id: number,
  transaction: Omit<Transaction, 'id' | 'categoryName' | 'categoryColor'>
): Promise<void> => {
  db.runSync(
    'UPDATE transactions SET date=?, amount=?, description=?, categoryId=?, type=?, isManual=?, recurrence=? WHERE id=?',
    [
      transaction.date,
      transaction.amount,
      transaction.description,
      transaction.categoryId,
      transaction.type,
      transaction.isManual ?? 0,
      transaction.recurrence ?? 'once',
      id,
    ]
  );
  return Promise.resolve();
};

export const deleteTransaction = (id: number): Promise<void> => {
  db.runSync('DELETE FROM transactions WHERE id = ?', [id]);
  return Promise.resolve();
};

export const getMonthlyBalance = (month: string): Promise<MonthlyBalance> => {
  const row = db.getFirstSync<{ income: number; expenses: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
     FROM transactions
     WHERE strftime('%Y-%m', date) = ? AND isManual = 0 AND isExcluded = 0`,
    [month]
  ) ?? { income: 0, expenses: 0 };

  return Promise.resolve({
    month,
    income: row.income,
    expenses: row.expenses,
    balance: row.income - row.expenses,
  });
};

export const getCategoryBalances = (
  month: string,
  type?: 'income' | 'expense'
): Promise<CategoryBalance[]> => {
  const rows = type
    ? db.getAllSync<CategoryBalance>(
        `SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(t.amount), 0) as total,
          COUNT(t.id) as count
         FROM categories c
         LEFT JOIN transactions t
           ON t.categoryId = c.id
           AND strftime('%Y-%m', t.date) = ?
           AND t.isManual = 0
           AND t.isExcluded = 0
           AND t.type = ?
         GROUP BY c.id
         HAVING count > 0
         ORDER BY total DESC`,
        [month, type]
      )
    : db.getAllSync<CategoryBalance>(
        `SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(t.amount), 0) as total,
          COUNT(t.id) as count
         FROM categories c
         LEFT JOIN transactions t
           ON t.categoryId = c.id
           AND strftime('%Y-%m', t.date) = ?
           AND t.isManual = 0
           AND t.isExcluded = 0
         GROUP BY c.id
         HAVING count > 0
         ORDER BY total DESC`,
        [month]
      );
  return Promise.resolve(rows);
};

export const getMonthlyBalancesForRange = (
  fromYm: string, toYm: string
): Promise<MonthlyBalance[]> => {
  const [f, t] = fromYm <= toYm ? [fromYm, toYm] : [toYm, fromYm];

  const rows = db.getAllSync<{ month: string; income: number; expenses: number }>(
    `SELECT
      strftime('%Y-%m', date) as month,
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expenses
    FROM transactions
    WHERE strftime('%Y-%m', date) >= ? AND strftime('%Y-%m', date) <= ? AND isManual = 0 AND isExcluded = 0
    GROUP BY month
    ORDER BY month`,
    [f, t]
  );

  const result: MonthlyBalance[] = [];
  let [cy, cm] = f.split('-').map(Number);
  const [ty, tm] = t.split('-').map(Number);

  while (cy < ty || (cy === ty && cm <= tm)) {
    const ym = `${cy}-${String(cm).padStart(2, '0')}`;
    const row = rows.find(r => r.month === ym);
    result.push({
      month: ym,
      income:   row?.income   ?? 0,
      expenses: row?.expenses ?? 0,
      balance: (row?.income ?? 0) - (row?.expenses ?? 0),
    });
    cm++;
    if (cm > 12) { cy++; cm = 1; }
  }

  return Promise.resolve(result);
};

export const hashExists = (hash: string): boolean => {
  const row = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE importHash = ?',
    [hash]
  );
  return (row?.count ?? 0) > 0;
};

export const bulkInsertCategorized = (
  items: Array<{ tx: ImportedTransaction; categoryId: number }>
): Promise<number> => {
  let inserted = 0;
  db.withTransactionSync(() => {
    for (const { tx, categoryId } of items) {
      if (!hashExists(tx.importHash)) {
        db.runSync(
          'INSERT INTO transactions (date, amount, description, categoryId, type, importHash, isManual, recurrence) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
          [tx.date, tx.amount, tx.description, categoryId, tx.type, tx.importHash, 'once']
        );
        inserted++;
      }
    }
  });
  return Promise.resolve(inserted);
};
