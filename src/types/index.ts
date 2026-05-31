export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  type: 'income' | 'expense' | 'both';
}

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  description: string;
  categoryId: number;
  categoryName?: string;
  categoryColor?: string;
  type: 'income' | 'expense';
  importHash?: string;
  isManual: number; // 1 = manuelle Schätzung, 0 = importiert/normal
}

export interface ImportedTransaction {
  date: string;
  amount: number;
  description: string;
  type: 'income' | 'expense';
  importHash: string;
}

export interface MonthlyBalance {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface CategoryBalance {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  total: number;
  count: number;
}

export type TransactionsStackParamList = {
  TransactionsList: undefined;
  AddTransaction: { transaction?: Transaction } | undefined;
};
