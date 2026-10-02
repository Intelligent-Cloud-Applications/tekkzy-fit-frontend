import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { removeExpense, saveExpense } from '../api';
import { ConfirmDialog } from '../confirm';
import { errorMessage } from '../errors';
import { todayISO } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { AppSheet, FormHint } from '../sheet';
import { pushToast } from '../toast';
import { useTheme } from '../theme';
import { DateField, ErrorText, Field, FormField, Select } from '../ui';
import type { ExpenseCategory, ExpenseMethod } from '../types';

const CATEGORIES: ExpenseCategory[] = [
  'Rent', 'Salary', 'Electricity', 'Water', 'Maintenance', 'Equipment', 'Supplies', 'Marketing', 'Cleaning', 'Other',
];

const METHODS: ExpenseMethod[] = ['CASH', 'UPI', 'CARD', 'BANK'];

export function ExpenseFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ExpenseForm'>) {
  const t = useTheme();
  const { expenses, refresh, setExpenses } = useGym();
  const existing = expenses.find((row) => row.id === route.params.expenseId);
  const [title, setTitle] = useState(existing?.title || '');
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category || 'Other');
  const [amount, setAmount] = useState(existing?.amount ? String(existing.amount) : '');
  const [date, setDate] = useState(existing?.date || todayISO());
  const [method, setMethod] = useState<ExpenseMethod>(existing?.method || 'CASH');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const methodOptions = useMemo(
    () => METHODS.map((item) => ({ value: item, label: item === 'CASH' ? 'Cash' : item === 'BANK' ? 'Bank' : item === 'CARD' ? 'Card' : 'UPI' })),
    [],
  );

  async function onSave() {
    if (!title.trim()) {
      setError('Enter a title');
      return;
    }
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveExpense({
        id: existing?.id,
        title: title.trim(),
        category,
        amount: rupees,
        date,
        method,
        notes: notes.trim(),
      });
      if (existing) {
        setExpenses(expenses.map((row) => (row.id === saved.id ? saved : row)));
      } else {
        setExpenses([saved, ...expenses]);
      }
      pushToast({ kind: 'success', title: existing ? 'Expense updated' : 'Expense added' });
      navigation.goBack();
      void refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not save expense'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!existing?.id) return;
    setBusy(true);
    setError('');
    try {
      await removeExpense(existing.id);
      setExpenses(expenses.filter((row) => row.id !== existing.id));
      pushToast({ kind: 'success', title: 'Expense deleted' });
      setConfirmDelete(false);
      navigation.goBack();
      void refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete expense'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <AppSheet
      title={existing ? 'Edit expense' : 'Add expense'}
      onClose={() => navigation.goBack()}
      onSave={() => void onSave()}
      saveTitle="Save"
      busy={busy}
    >
      <FormHint>Record gym spending. This does not change member payments.</FormHint>
      <ErrorText text={error} />
      <FormField label="Title">
        <Field value={title} onChangeText={setTitle} placeholder="e.g. April rent" />
      </FormField>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FormField label="Category">
            <Select
              value={category}
              onChange={(value) => setCategory(value as ExpenseCategory)}
              options={CATEGORIES.map((item) => ({ value: item, label: item }))}
            />
          </FormField>
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="Method">
            <Select value={method} onChange={(value) => setMethod(value as ExpenseMethod)} options={methodOptions} />
          </FormField>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FormField label="Amount (₹)">
            <Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          </FormField>
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="Date">
            <DateField value={date} onChange={setDate} />
          </FormField>
        </View>
      </View>
      <FormField label="Notes">
        <Field value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      </FormField>
      {existing ? (
        <Pressable
          onPress={() => setConfirmDelete(true)}
          disabled={busy}
          style={{ marginTop: 6, alignItems: 'center', paddingVertical: 12 }}
        >
          <Text style={{ color: t.name === 'light' ? '#c81e1e' : '#ff6b6b', fontSize: 13, fontWeight: '700' }}>
            Delete expense
          </Text>
        </Pressable>
      ) : null}
    </AppSheet>
    <ConfirmDialog
      open={confirmDelete}
      title="Delete expense"
      message="This expense will be removed from the gym record."
      danger
      confirmLabel="Delete"
      busy={busy}
      onClose={() => { if (!busy) setConfirmDelete(false); }}
      onConfirm={() => void onDelete()}
    />
    </>
  );
}
