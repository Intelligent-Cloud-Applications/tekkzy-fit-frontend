const { json, requireGymKey, method, institutionFrom } = require('./http');
const dynamo = require('./dynamo');
const { toMember, matchesAddedBy, today, addCalendarDays } = require('./map');
const { isPaid, paidAmount } = require('./reports');

const DUE_WINDOW_DAYS = 7;
const PAGE_SIZE = 20;
const OWNER_ROLES = ['admin', 'manager', 'super_admin'];

function monthOf(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today().slice(0, 7);
}

function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function daysIn(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const sum = (list) => list.reduce((total, n) => total + n, 0);

/** Daily paid income and expense for one YYYY-MM (index 0 = day 1). */
async function monthMoney(institution, ym, expenses) {
  const days = daysIn(ym);
  const income = Array(days).fill(0);
  const expense = Array(days).fill(0);
  const paidRows = [];
  const expenseRows = [];
  const payments = await dynamo.listPayments(institution, { month: ym });
  for (const row of payments) {
    if (!isPaid(row)) continue;
    const date = String(row.payDay || row.paymentKey || '').slice(0, 10);
    const day = Number(date.slice(8, 10));
    if (day < 1 || day > days) continue;
    const amount = paidAmount(row);
    income[day - 1] += amount;
    paidRows.push({
      id: row.paymentId,
      memberId: row.memberId || row.cognitoId || '',
      memberName: row.client || row.userName || '',
      planName: row.planName || '',
      amount,
      date,
      method: String(row.paymentMode || '').toUpperCase(),
    });
  }
  for (const row of expenses) {
    const date = String(row.date || '').slice(0, 10);
    if (date.slice(0, 7) !== ym) continue;
    const day = Number(date.slice(8, 10));
    if (day < 1 || day > days) continue;
    expense[day - 1] += Number(row.amount || 0);
    expenseRows.push({
      id: row.expenseId,
      title: row.title || '',
      category: row.category || 'Other',
      amount: Number(row.amount || 0),
      date,
      method: row.method || 'CASH',
    });
  }
  return { income, expense, paidRows, expenseRows };
}

function memberRow(member) {
  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    planName: member.planName,
    amount: Number(member.amount || 0),
    joinDate: member.joinDate,
    renewDate: member.renewDate,
    status: member.status,
    paymentStatus: member.paymentStatus,
    devicePhotoUrl: member.devicePhotoUrl,
    addedById: member.addedById || '',
    addedByName: member.addedByName || '',
  };
}

const byDate = (key, dir = 1) => (a, b) => dir * String(a[key] || '').localeCompare(String(b[key] || ''));

/**
 * `list` = dues | active | new | revenue returns one page of the rows behind that card instead of totals.
 * `page` = { offset, limit, type } where type (payments | expenses) picks the revenue rows.
 */
async function buildDashboard(institution, ym, list = '', page = { offset: 0, limit: PAGE_SIZE, type: 'payments' }) {
  const prevYm = previousMonth(ym);
  const [rows, expenses] = await Promise.all([
    dynamo.listMembers(institution, { includeStaff: true }),
    dynamo.listExpenses(institution).catch(() => []),
  ]);
  const [current, previous] = await Promise.all([
    monthMoney(institution, ym, expenses),
    monthMoney(institution, prevYm, expenses),
  ]);

  const now = today();
  const dueBy = addCalendarDays(now, DUE_WINDOW_DAYS);
  const dues = { amount: 0, members: 0, withinDays: DUE_WINDOW_DAYS };
  const active = { count: 0, newThisMonth: 0 };
  const staff = { total: 0, trainers: 0, others: 0 };
  const lists = { dues: [], active: [], new: [] };

  for (const row of rows) {
    const member = toMember(row);
    if (member.userType === 'staff') {
      if (OWNER_ROLES.includes(String(row.cognitoRole || '').toLowerCase())) continue;
      staff.total += 1;
      if (String(row.staffRole || '').toLowerCase() === 'trainer') staff.trainers += 1;
      else staff.others += 1;
      continue;
    }
    if (member.status === 'ACTIVE') {
      active.count += 1;
      lists.active.push(memberRow(member));
    }
    if (String(member.joinDate || '').startsWith(ym)) {
      active.newThisMonth += 1;
      lists.new.push(memberRow(member));
    }
    const due = String(member.renewDate || '').slice(0, 10);
    if (member.status !== 'SUSPENDED' && due && due >= now && due <= dueBy) {
      dues.members += 1;
      dues.amount += Number(member.amount || 0);
      lists.dues.push(memberRow(member));
    }
  }

  if (list) {
    const { offset, limit, type } = page;
    const slice = (rows) => rows.slice(offset, offset + limit);
    if (list === 'revenue') {
      const rowsOf = type === 'expenses' ? current.expenseRows : current.paidRows;
      const sorted = rowsOf.sort(byDate('date', -1));
      return {
        month: ym,
        list,
        type: type === 'expenses' ? 'expenses' : 'payments',
        income: sum(current.income),
        expense: sum(current.expense),
        paymentsCount: current.paidRows.length,
        expensesCount: current.expenseRows.length,
        total: sorted.length,
        offset,
        limit,
        rows: slice(sorted),
      };
    }
    const rowsOf = page.addedBy ? lists[list].filter((m) => matchesAddedBy(m, page.addedBy)) : lists[list];
    const sorted = list === 'new' ? rowsOf.sort(byDate('joinDate', -1)) : rowsOf.sort(byDate('renewDate'));
    return {
      month: ym,
      list,
      total: sorted.length,
      amount: sorted.reduce((a, m) => a + m.amount, 0),
      offset,
      limit,
      rows: slice(sorted),
    };
  }

  const income = sum(current.income);
  const expense = sum(current.expense);
  const net = income - expense;
  const previousNet = sum(previous.income) - sum(previous.expense);
  return {
    month: ym,
    generatedAt: new Date().toISOString(),
    upcomingDues: dues,
    activeMembers: active,
    revenue: {
      income,
      expense,
      net,
      previousNet,
      changePct: previousNet ? Math.round(((net - previousNet) / Math.abs(previousNet)) * 100) : null,
    },
    staff,
    trend: { days: current.income.length, income: current.income, expense: current.expense },
  };
}

exports.buildDashboard = buildDashboard;

exports.handler = async (event) => {
  if (method(event) === 'OPTIONS') return json(200, { ok: true });
  if (!requireGymKey(event)) return json(401, { error: 'Unauthorized' });
  if (method(event) !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const qs = event.queryStringParameters || {};
    const list = ['dues', 'active', 'new', 'revenue'].includes(qs.list) ? qs.list : '';
    const page = {
      offset: Math.max(0, Number.parseInt(qs.offset, 10) || 0),
      limit: Math.min(100, Math.max(1, Number.parseInt(qs.limit, 10) || PAGE_SIZE)),
      type: qs.type === 'expenses' ? 'expenses' : 'payments',
      addedBy: String(qs.addedBy || '').trim(),
    };
    return json(200, await buildDashboard(institutionFrom(event), monthOf(qs.month), list, page));
  } catch (err) {
    console.error('dashboard', err);
    return json(500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};
