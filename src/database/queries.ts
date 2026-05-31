import { db } from './database';
import { Transaction, Category, MonthlyBalance, CategoryBalance, ImportedTransaction } from '../types';

export const getCategories = (): Promise<Category[]> =>
  Promise.resolve(db.getAllSync<Category>('SELECT * FROM categories ORDER BY name'));

export const addCategory = (category: Omit<Category, 'id'>): Promise<number> => {
  const result = db.runSync(
    'INSERT INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
    [category.name, category.color, category.icon, category.type]
  );
  return Promise.resolve(result.lastInsertRowId);
};

export const deleteCategory = (id: number): Promise<void> => {
  db.runSync('DELETE FROM categories WHERE id = ?', [id]);
  return Promise.resolve();
};

export const getTransactions = (month?: string): Promise<Transaction[]> => {
  const rows = month
    ? db.getAllSync<Transaction>(
        `SELECT t.*, c.name as categoryName, c.color as categoryColor
         FROM transactions t
         LEFT JOIN categories c ON t.categoryId = c.id
         WHERE strftime('%Y-%m', t.date) = ?
         ORDER BY t.isManual ASC, t.date DESC`,
        [month]
      )
    : db.getAllSync<Transaction>(
        `SELECT t.*, c.name as categoryName, c.color as categoryColor
         FROM transactions t
         LEFT JOIN categories c ON t.categoryId = c.id
         ORDER BY t.isManual ASC, t.date DESC`
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
     WHERE strftime('%Y-%m', date) = ? AND isManual = 0`,
    [month]
  ) ?? { income: 0, expenses: 0 };

  return Promise.resolve({
    month,
    income: row.income,
    expenses: row.expenses,
    balance: row.income - row.expenses,
  });
};

export const getCategoryBalances = (month: string): Promise<CategoryBalance[]> =>
  Promise.resolve(
    db.getAllSync<CategoryBalance>(
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
       GROUP BY c.id
       HAVING count > 0
       ORDER BY total DESC`,
      [month]
    )
  );

export const hashExists = (hash: string): boolean => {
  const row = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE importHash = ?',
    [hash]
  );
  return (row?.count ?? 0) > 0;
};

export const bulkInsertTransactions = (
  transactions: ImportedTransaction[],
  categoryId: number
): Promise<number> => {
  let inserted = 0;
  db.withTransactionSync(() => {
    for (const t of transactions) {
      if (!hashExists(t.importHash)) {
        db.runSync(
          'INSERT INTO transactions (date, amount, description, categoryId, type, importHash, isManual, recurrence) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
          [t.date, t.amount, t.description, categoryId, t.type, t.importHash, 'once']
        );
        inserted++;
      }
    }
  });
  return Promise.resolve(inserted);
};
