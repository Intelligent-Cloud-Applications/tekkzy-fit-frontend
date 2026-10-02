import type { Expense, ExpenseCategory, ExpenseMethod } from '@shared/types';
import { todayISODate } from '@/lib/format';
import { apiRequest } from '@/services/api';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Salary',
  'Electricity',
  'Water',
  'Maintenance',
  'Equipment',
  'Supplies',
  'Marketing',
  'Cleaning',
  'Other',
];

export const EXPENSE_METHODS: ExpenseMethod[] = ['CASH', 'UPI', 'CARD', 'BANK'];

export function expenseMethodLabel(method?: string) {
  const value = String(method || '').toUpperCase();
  if (value === 'CASH') return 'Cash';
  if (value === 'UPI') return 'UPI';
  if (value === 'CARD') return 'Card';
  if (value === 'BANK') return 'Bank';
  return value || '—';
}

export function emptyExpense(): Expense {
  return {
    id: '',
    title: '',
    category: 'Other',
    amount: 0,
    date: todayISODate(),
    method: 'CASH',
    notes: '',
    createdAt: new Date().toISOString(),
  };
}

export async function listExpenses(): Promise<Expense[]> {
  const rows = await apiRequest<Expense[]>('/expenses');
  return Array.isArray(rows) ? rows : [];
}

export async function saveExpense(row: Expense): Promise<Expense> {
  const path = row.id ? `/expenses/${encodeURIComponent(row.id)}` : '/expenses';
  return apiRequest<Expense>(path, {
    method: row.id ? 'PUT' : 'POST',
    body: JSON.stringify(row),
  });
}

export async function removeExpense(id: string): Promise<void> {
  await apiRequest(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function expenseKpis(rows: Expense[]) {
  const today = todayISODate();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  return {
    today: rows.filter((row) => row.date === today).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    month: rows.filter((row) => String(row.date).startsWith(month)).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    year: rows.filter((row) => String(row.date).startsWith(year)).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    count: rows.length,
  };
}
