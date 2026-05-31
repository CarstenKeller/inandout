import db from './database';
import { Transaction, Category, MonthlyBalance, CategoryBalance, ImportedTransaction } from '../types';

export const getCategories = (): Promise<Category[]> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM categories ORDER BY name',
        [],
        (_, { rows }) => resolve(rows._array as Category[]),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const addCategory = (category: Omit<Category, 'id'>): Promise<number> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
        [category.name, category.color, category.icon, category.type],
        (_, { insertId }) => resolve(insertId!),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const deleteCategory = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'DELETE FROM categories WHERE id = ?',
        [id],
        () => resolve(),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const getTransactions = (month?: string): Promise<Transaction[]> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      const query = month
        ? `SELECT t.*, c.name as categoryName, c.color as categoryColor
           FROM transactions t
           LEFT JOIN categories c ON t.categoryId = c.id
           WHERE strftime('%Y-%m', t.date) = ?
           ORDER BY t.date DESC`
        : `SELECT t.*, c.name as categoryName, c.color as categoryColor
           FROM transactions t
           LEFT JOIN categories c ON t.categoryId = c.id
           ORDER BY t.date DESC`;
      const params = month ? [month] : [];
      tx.executeSql(
        query,
        params,
        (_, { rows }) => resolve(rows._array as Transaction[]),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const addTransaction = (transaction: Omit<Transaction, 'id'>): Promise<number> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO transactions (date, amount, description, categoryId, type, importHash) VALUES (?, ?, ?, ?, ?, ?)',
        [
          transaction.date,
          transaction.amount,
          transaction.description,
          transaction.categoryId,
          transaction.type,
          transaction.importHash ?? null,
        ],
        (_, { insertId }) => resolve(insertId!),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const deleteTransaction = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'DELETE FROM transactions WHERE id = ?',
        [id],
        () => resolve(),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const getMonthlyBalance = (month: string): Promise<MonthlyBalance> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT
          ? as month,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
         FROM transactions
         WHERE strftime('%Y-%m', date) = ?`,
        [month, month],
        (_, { rows }) => {
          const row = rows._array[0];
          resolve({
            month: row.month,
            income: row.income,
            expenses: row.expenses,
            balance: row.income - row.expenses,
          });
        },
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const getCategoryBalances = (month: string): Promise<CategoryBalance[]> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(t.amount), 0) as total,
          COUNT(t.id) as count
         FROM categories c
         LEFT JOIN transactions t ON t.categoryId = c.id AND strftime('%Y-%m', t.date) = ?
         GROUP BY c.id
         HAVING count > 0
         ORDER BY total DESC`,
        [month],
        (_, { rows }) => resolve(rows._array as CategoryBalance[]),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const hashExists = (hash: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT COUNT(*) as count FROM transactions WHERE importHash = ?',
        [hash],
        (_, { rows }) => resolve(rows._array[0].count > 0),
        (_, error) => { reject(error); return false; }
      );
    });
  });
};

export const bulkInsertTransactions = async (
  transactions: ImportedTransaction[],
  categoryId: number
): Promise<number> => {
  let inserted = 0;
  for (const t of transactions) {
    const exists = await hashExists(t.importHash);
    if (!exists) {
      await addTransaction({ ...t, categoryId });
      inserted++;
    }
  }
  return inserted;
};
