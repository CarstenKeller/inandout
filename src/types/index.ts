export interface Account {
  id: number;
  name: string;
  color: string;
  iban?: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  type: 'income' | 'expense' | 'both';
  keywords: string;
  amount_rules?: string;
}

export type Recurrence = 'once' | 'monthly' | 'quarterly' | 'yearly';

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  description: string;
  categoryId: number;
  categoryName?: string;
  categoryColor?: string;
  accountId?: number;
  accountName?: string;
  accountColor?: string;
  type: 'income' | 'expense';
  importHash?: string;
  isManual: number;
  recurrence: Recurrence;
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

export interface PeriodBalance {
  label: string;
  income: number;
  expenses: number;
  balance: number;
}

export type TransactionsStackParamList = {
  TransactionsList: {
    typeFilter?: 'income' | 'expense';
    filterCategoryId?: number;
    filterMonth?: string;
    filterAccountId?: number;
  } | undefined;
  AddTransaction: { transaction?: Transaction; defaultManual?: boolean } | undefined;
};

export type PlanningStackParamList = {
  PlanningMain: undefined;
  AddTransaction: { transaction?: Transaction; defaultManual?: boolean } | undefined;
};

export type ImportStackParamList = {
  ImportMain: undefined;
  ImportReview: { sessionId: number };
};

export interface ImportSessionRecord {
  id: number;
  filename: string;
  file_hash: string;
  imported_at: string;
  total_count: number;
  auto_count: number;
  assigned_count: number;
  skipped_count: number;
  account_id: number | null;
}

export interface ImportItemRecord {
  id: number;
  session_id: number;
  import_hash: string;
  date: string;
  amount: number;
  description: string;
  type: 'income' | 'expense';
  status: 'pending' | 'auto' | 'assigned' | 'skipped';
  category_id: number | null;
}
