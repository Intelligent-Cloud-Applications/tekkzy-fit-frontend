const { json, parseBody, requireGymKey, method, institutionFrom } = require('./http');
const dynamo = require('./dynamo');

function monthKey(date = new Date()) {
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).replace(' ', '-');
}

function monthRange(key) {
  const parsed = new Date(`${String(key || '').replace('-', ' ')} 1`);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    start: new Date(parsed.getFullYear(), parsed.getMonth(), 1),
    end: new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1),
  };
}

function punchKey(row) {
  const raw = String(row.memberCode || row.memberId || row.id || '').replace(/\D/g, '');
  const enroll = raw ? String(Number(raw)) : String(row.id || '');
  return `${enroll}|${String(row.timestamp || '')}`;
}

function compactPunch(row) {
  return {
    id: String(row.id || ''),
    memberId: String(row.memberId || ''),
    memberName: String(row.memberName || ''),
    memberCode: String(row.memberCode || ''),
    timestamp: String(row.timestamp || ''),
    type: String(row.type || 'ENTRY'),
    status: String(row.status || 'GRANTED'),
    reason: String(row.reason || ''),
    deviceName: String(row.deviceName || ''),
    deletedAt: row.deletedAt || new Date().toISOString(),
  };
}

function mergeDeleted(existing, body) {
  const rows = Array.isArray(existing?.deletedAttendance) ? [...existing.deletedAttendance] : [];
  const incoming = [];
  if (body.archiveAttendance) incoming.push(body.archiveAttendance);
  if (Array.isArray(body.deletedAttendance)) incoming.push(...body.deletedAttendance);
  let addedGranted = 0;
  for (const row of incoming) {
    if (!row) continue;
    const key = punchKey(row);
    if (rows.some((item) => punchKey(item) === key)) continue;
    rows.push(compactPunch(row));
    if (String(row.status || 'GRANTED').toUpperCase() === 'GRANTED') addedGranted += 1;
  }
  return { deletedAttendance: rows.slice(-2000), addedGranted };
}

function compactReimbursement(row) {
  return {
    id: String(row?.id || ''),
    date: String(row?.date || '').slice(0, 10),
    amount: Number(row?.amount || 0),
    paidTo: String(row?.paidTo || '').trim(),
    reason: String(row?.reason || '').trim(),
    method: String(row?.method || 'CASH').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'CASH',
    createdAt: String(row?.createdAt || new Date().toISOString()),
  };
}

function mergeReimbursements(existing, body) {
  let rows = Array.isArray(existing?.reimbursements) ? [...existing.reimbursements] : [];
  if (Array.isArray(body.reimbursements)) {
    rows = body.reimbursements.map(compactReimbursement).filter((row) => row.id && row.amount > 0);
  }
  if (body.addReimbursement) {
    const next = compactReimbursement(body.addReimbursement);
    if (next.id && next.amount > 0 && !rows.some((row) => row.id === next.id)) {
      rows.push(next);
    }
  }
  if (body.removeReimbursementId) {
    rows = rows.filter((row) => row.id !== String(body.removeReimbursementId));
  }
  return rows.slice(-500);
}

function toRow(item) {
  return {
    month: item.month || item.monthAndYear || item.cognitoIdAndMonth,
    totalAttendance: Number(item.totalAttendance || 0),
    totalMembers: Number(item.totalMembers || 0),
    cashPayment: Number(item.cashPayment || item.incomes?.cash || 0),
    upiPayment: Number(item.upiPayment || item.incomes?.upi || 0),
    razorpayPayment: Number(item.razorpayPayment || item.incomes?.razorpay || 0),
    totalExpense: Number(item.totalExpense || item.expenses?.total || 0),
    totalDiscontinued: Number(item.totalDiscontinued || 0),
    deletedAttendance: Array.isArray(item.deletedAttendance) ? item.deletedAttendance : [],
    reimbursements: Array.isArray(item.reimbursements) ? item.reimbursements : [],
    updatedAt: item.updatedAt || '',
  };
}

function isPaid(row) {
  return String(row.paymentStatus || row.status || '').toUpperCase() === 'PAID';
}

function paidAmount(row) {
  const mode = String(row.paymentMode || row.method || '').toUpperCase();
  if (mode === 'CASH' || mode === 'UPI') return Number(row.amount || row.netAmount || 0);
  return Number(row.netAmount != null ? row.netAmount : row.amount || 0);
}

function activeProfiles(rows = []) {
  return rows.filter((row) => {
    const status = String(row.status || row.membershipStatus || '').toUpperCase();
    if (['DELETED', 'HIDDEN', 'ARCHIVED'].includes(status)) return false;
    if (row.deletedAt || row.deleted) return false;
    return true;
  });
}

function isDiscontinued(profile) {
  const status = String(profile.status || profile.membershipStatus || '').toUpperCase();
  const sub = String(profile.subscriptionStatus || '').toUpperCase();
  const end = String(profile.renewDate || profile.rePaymentDate || profile.deviceEnd || '').slice(0, 10);
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const expired = Boolean(end && end < todayIst);
  if (['EXPIRED', 'CANCELLED', 'INACTIVE'].includes(status)) return true;
  if (['CANCELLED', 'EXPIRED', 'HALTED'].includes(sub)) return true;
  if (expired) return true;
  return false;
}

function fromBody(institution, body, existing) {
  const month = String(body.month || existing?.cognitoIdAndMonth || monthKey()).trim();
  const merged = mergeDeleted(existing, body);
  const prevAttendance = Number(existing?.totalAttendance ?? 0);
  const incomingAttendance = body.totalAttendance != null ? Number(body.totalAttendance) : null;
  // Attendance only: keep previous high-water mark and add newly archived punches.
  const totalAttendance = incomingAttendance == null
    ? prevAttendance + merged.addedGranted
    : Math.max(prevAttendance, incomingAttendance);

  // Money / members / expense: always use the latest live values (can go down on delete).
  const cashPayment = Number(body.cashPayment ?? existing?.cashPayment ?? 0);
  const upiPayment = Number(body.upiPayment ?? existing?.upiPayment ?? 0);
  const razorpayPayment = Number(body.razorpayPayment ?? existing?.razorpayPayment ?? 0);
  const totalExpense = Number(body.totalExpense ?? existing?.totalExpense ?? 0);
  const totalMembers = Number(body.totalMembers ?? existing?.totalMembers ?? 0);
  const totalDiscontinued = Number(body.totalDiscontinued ?? existing?.totalDiscontinued ?? 0);

  return {
    ...(existing || {}),
    institution,
    cognitoIdAndMonth: month,
    month,
    monthAndYear: month,
    type: 'gym',
    totalAttendance,
    totalMembers,
    cashPayment,
    upiPayment,
    razorpayPayment,
    totalExpense,
    totalDiscontinued,
    deletedAttendance: merged.deletedAttendance,
    reimbursements: mergeReimbursements(existing, body),
    incomes: {
      ...(existing?.incomes || {}),
      cash: cashPayment,
      upi: upiPayment,
      razorpay: razorpayPayment,
    },
    expenses: {
      ...(existing?.expenses || {}),
      total: totalExpense,
    },
    updatedAt: new Date().toISOString(),
  };
}

function expenseInMonth(row, start, end) {
  const day = new Date(`${String(row.date || '').slice(0, 10)}T00:00:00`);
  return !Number.isNaN(day.getTime()) && day >= start && day < end;
}

async function computeCloudSnapshot(institution, month, extras = {}) {
  const { start, end } = monthRange(month);
  const ym = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const [membersRaw, payments, expenses] = await Promise.all([
    dynamo.listProfiles(institution),
    dynamo.listPayments(institution, { month: ym }),
    dynamo.listExpenses(institution).catch(() => []),
  ]);
  const members = activeProfiles(membersRaw);
  const monthPays = payments.filter(isPaid);
  const cashPayment = monthPays
    .filter((row) => String(row.paymentMode || row.method || '').toUpperCase() === 'CASH')
    .reduce((sum, row) => sum + paidAmount(row), 0);
  const upiPayment = monthPays
    .filter((row) => String(row.paymentMode || row.method || '').toUpperCase() === 'UPI')
    .reduce((sum, row) => sum + paidAmount(row), 0);
  const razorpayPayment = monthPays
    .filter((row) => !['CASH', 'UPI'].includes(String(row.paymentMode || row.method || '').toUpperCase()))
    .reduce((sum, row) => sum + paidAmount(row), 0);
  const liveExpense = expenses
    .filter((row) => expenseInMonth(row, start, end))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  // Prefer live expense list; allow client override only when live list is empty and client sent a value.
  const totalExpense = extras.totalExpense != null && !(expenses && expenses.length)
    ? Number(extras.totalExpense)
    : liveExpense;
  return {
    month,
    totalAttendance: extras.totalAttendance != null ? Number(extras.totalAttendance) : undefined,
    totalMembers: members.length,
    cashPayment,
    upiPayment,
    razorpayPayment,
    totalExpense,
    totalDiscontinued: members.filter(isDiscontinued).length,
  };
}

async function saveSnapshot(institution, body) {
  const month = String(body.month || monthKey()).trim();
  const existing = await dynamo.getReport(institution, month);
  const computed = await computeCloudSnapshot(institution, month, body);
  // Prefer cloud-computed money/expense (full month), then merge with previous stored totals.
  const mergedBody = {
    ...body,
    month,
    cashPayment: computed.cashPayment,
    upiPayment: computed.upiPayment,
    razorpayPayment: computed.razorpayPayment,
    totalExpense: computed.totalExpense,
    totalMembers: computed.totalMembers,
    totalDiscontinued: computed.totalDiscontinued,
    // Keep client attendance if provided (includes archived); fromBody will max() with previous.
    totalAttendance: body.totalAttendance != null ? body.totalAttendance : computed.totalAttendance,
  };
  const saved = await dynamo.putReport(fromBody(institution, mergedBody, existing));
  return toRow(saved);
}

exports.isPaid = isPaid;
exports.paidAmount = paidAmount;
exports.computeCloudSnapshot = computeCloudSnapshot;
exports.saveSnapshot = saveSnapshot;
exports.monthKey = monthKey;

exports.handler = async (event) => {
  if (method(event) === 'OPTIONS') return json(200, { ok: true });
  if (!requireGymKey(event)) return json(401, { error: 'Unauthorized' });

  try {
    const verb = method(event);
    const body = verb === 'GET' ? {} : parseBody(event);
    const institution = institutionFrom(event, body);

    if (verb === 'GET') {
      const rows = (await dynamo.listReports(institution))
        .map(toRow)
        .sort((a, b) => String(b.updatedAt || b.month).localeCompare(String(a.updatedAt || a.month)));
      return json(200, rows);
    }

    if (verb === 'POST' || verb === 'PUT') {
      return json(200, await saveSnapshot(institution, body));
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('reports', err);
    return json(500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};

async function runDailyReport(institution = dynamo.fallbackInstitution()) {
  const month = monthKey();
  const existing = await dynamo.getReport(institution, month);
  const saved = await saveSnapshot(institution, {
    month,
    totalAttendance: existing?.totalAttendance,
  });
  return { ok: true, month, ...saved };
}

exports.runDailyReport = runDailyReport;
exports.daily = async () => {
  const results = [];
  for (const institution of dynamo.tekkzyFitInstitutions()) {
    results.push(await runDailyReport(institution).catch((err) => ({ ok: false, institution, error: err.message })));
  }
  return results;
};
