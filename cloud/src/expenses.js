const { json, parseBody, requireGymKey, pathId, method, institutionFrom } = require('./http');
const dynamo = require('./dynamo');
const reports = require('./reports');

const CATEGORIES = [
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

const METHODS = ['CASH', 'UPI', 'CARD', 'BANK'];

function newExpenseId() {
  return `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function monthFromExpenseDate(iso) {
  const day = String(iso || '').slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T12:00:00+05:30`)
    : new Date();
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).replace(' ', '-');
}

async function syncExpenseIntoReport(institution, date) {
  try {
    await reports.saveSnapshot(institution, { month: monthFromExpenseDate(date) });
  } catch (err) {
    console.error('expense report sync', err);
  }
}

function toExpense(row) {
  return {
    id: row.expenseId,
    title: row.title || '',
    category: row.category || 'Other',
    amount: Number(row.amount || 0),
    date: row.date || '',
    method: row.method || 'CASH',
    notes: row.notes || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
  };
}

function fromExpense(institution, body, existing) {
  const id = String(body.id || existing?.expenseId || '').trim() || newExpenseId();
  const title = String(body.title ?? existing?.title ?? '').trim();
  if (!title) throw new Error('Expense title is required');
  const amount = Number(body.amount ?? existing?.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount');
  const category = String(body.category ?? existing?.category ?? 'Other').trim() || 'Other';
  const methodValue = String(body.method ?? existing?.method ?? 'CASH').toUpperCase();
  const date = String(body.date ?? existing?.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    institutionId: institution,
    expenseId: id,
    title,
    category: CATEGORIES.includes(category) ? category : 'Other',
    amount,
    date,
    method: METHODS.includes(methodValue) ? methodValue : 'CASH',
    notes: String(body.notes ?? existing?.notes ?? '').trim(),
    createdAt: existing?.createdAt || body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  if (method(event) === 'OPTIONS') return json(200, { ok: true });
  if (!requireGymKey(event)) return json(401, { error: 'Unauthorized' });

  try {
    const verb = method(event);
    const id = pathId(event);
    const body = verb === 'GET' || verb === 'DELETE' ? {} : parseBody(event);
    const institution = institutionFrom(event, body);

    if (verb === 'GET' && !id) {
      const rows = await dynamo.listExpenses(institution);
      return json(200, rows.map(toExpense).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))));
    }

    if (verb === 'GET' && id) {
      const row = await dynamo.getExpense(institution, id);
      if (!row) return json(404, { error: 'Expense not found' });
      return json(200, toExpense(row));
    }

    if (verb === 'POST' || ((verb === 'PUT' || verb === 'PATCH') && id)) {
      const existing = id ? await dynamo.getExpense(institution, id) : await dynamo.getExpense(institution, body.id);
      const saved = await dynamo.putExpense(fromExpense(institution, { ...body, id: id || body.id }, existing));
      await syncExpenseIntoReport(institution, saved.date);
      if (existing?.date && existing.date !== saved.date) {
        await syncExpenseIntoReport(institution, existing.date);
      }
      return json(existing ? 200 : 201, toExpense(saved));
    }

    if (verb === 'DELETE' && id) {
      const existing = await dynamo.getExpense(institution, id);
      await dynamo.deleteExpense(institution, id);
      if (existing?.date) await syncExpenseIntoReport(institution, existing.date);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('expenses', err);
    const message = err instanceof Error ? err.message : 'Server error';
    const status = /required|valid amount/i.test(message) ? 400 : 500;
    return json(status, { error: message });
  }
};
