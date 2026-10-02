const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { persistRowPhoto } = require('./photos');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' }), {
  marshallOptions: { removeUndefinedValues: true },
});

const PROFILE = process.env.PROFILE_TABLE_NAME || 'beta_user_profile';
const MEMBERS = process.env.MEMBERS_TABLE_NAME || 'beta_tekkzyfit_members';
const PAYMENT = process.env.PAYMENT_TABLE_NAME || 'beta_tekkzyfit_payments';
const REPORT = process.env.REPORT_TABLE_NAME || 'beta_monthly_report';
const PRODUCT = process.env.PRODUCT_TABLE_NAME || 'beta_institute_product';
const EXPENSE = process.env.EXPENSE_TABLE_NAME || 'beta_expense_table';
const CODEGEN = process.env.CODEGEN_TABLE_NAME || 'code_generator_variables';
const codegenClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.CODEGEN_TABLE_REGION || 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

/** Tekkzy Fit gym — members live in tekkzyfit_members / beta_tekkzyfit_members only. */
const TEKKZYFIT_INSTITUTIONS = new Set(
  String(process.env.MEMBERS_INSTITUTIONS || process.env.INSTITUTION || 'Tekkzyfit001')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

function fallbackInstitution() {
  return process.env.INSTITUTION || 'Tekkzyfit001';
}

/** Every gym served by this stage (daily jobs run once per gym). */
function tekkzyFitInstitutions() {
  return [...TEKKZYFIT_INSTITUTIONS];
}

function isTekkzyFitInstitution(institution) {
  return TEKKZYFIT_INSTITUTIONS.has(String(institution || '').trim());
}

function isReservedProfileId(id) {
  return String(id || '').startsWith('__');
}

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function membershipStatusOf(row) {
  if (String(row.status || '').toUpperCase() === 'SUSPENDED') return 'SUSPENDED';
  const renew = String(row.renewDate || row.rePaymentDate || row.deviceEnd || '').slice(0, 10);
  if (renew && renew < todayYmd()) return 'EXPIRED';
  return 'ACTIVE';
}

function isStaffProfile(row) {
  const email = String(row.emailId || row.email || '').trim().toLowerCase();
  if (email === 'admin@tekkzy.com' || email === 'manager@tekkzy.com') return true;
  const type = String(row.userType || row.role || row.cognitoRole || '').trim().toLowerCase();
  return type === 'admin' || type === 'manager' || type === 'staff' || type === 'super_admin';
}

function peopleUserType(row) {
  const type = String(row.userType || '').trim().toLowerCase();
  if (type === 'staff' || type === 'admin' || type === 'manager' || type === 'super_admin') return 'staff';
  if (isStaffProfile(row)) return 'staff';
  return 'member';
}

function isGymMemberRow(row) {
  if (!row) return false;
  if (isReservedProfileId(row.cognitoId) || isReservedProfileId(row.memberId)) return false;
  if (peopleUserType(row) === 'staff') return false;
  const type = String(row.userType || '').trim().toLowerCase();
  return !type || type === 'member';
}

function normalizeMemberRow(item, institution = fallbackInstitution()) {
  const institutionId = String(item.institutionId || item.institution || institution).trim();
  const memberId = String(item.memberId || item.cognitoId || '').trim();
  const cognitoId = String(item.cognitoId || memberId).trim();
  const name = String(
    item.userName || item.name || `${item.firstName || ''} ${item.lastName || ''}`,
  ).trim() || 'Member';
  const nameLower = name.toLowerCase();
  const userType = peopleUserType(item);
  const membershipStatus = userType === 'staff' ? 'STAFF' : membershipStatusOf({ ...item, userName: name });
  const cognitoRole = String(item.cognitoRole || item.role || '').trim().toLowerCase()
    || (String(item.emailId || item.email || '').toLowerCase() === 'admin@tekkzy.com' ? 'admin' : '')
    || (String(item.emailId || item.email || '').toLowerCase() === 'manager@tekkzy.com' ? 'manager' : '')
    || (userType === 'staff' ? 'staff' : '');
  const row = compactMember({
    ...item,
    institutionId,
    institution: institutionId,
    memberId,
    cognitoId,
    userName: name,
    name,
    nameLower,
    nameSort: `${nameLower}#${memberId}`,
    membershipStatus,
    statusKey: `${institutionId}#${membershipStatus}`,
    userType,
    ...(userType === 'staff' && cognitoRole ? { cognitoRole } : {}),
  });
  return row;
}

function usesMembersTable(itemOrInstitution, id = '') {
  if (isReservedProfileId(id)) return false;
  if (typeof itemOrInstitution === 'string') {
    return isTekkzyFitInstitution(itemOrInstitution);
  }
  const row = itemOrInstitution || {};
  if (isReservedProfileId(row.cognitoId) || isReservedProfileId(row.memberId)) return false;
  const type = String(row.userType || '').trim().toLowerCase();
  if (type === 'device-bridge' || type === 'plan') return false;
  if (type && !['member', 'staff', 'admin', 'manager', 'super_admin'].includes(type) && !isStaffProfile(row)) {
    return false;
  }
  return isTekkzyFitInstitution(row.institutionId || row.institution);
}

const MEMBER_DROP = [
  'address',
  'city',
  'emergencyContactName',
  'emergencyContactPhone',
  'app',
  'source',
  'role',
];

function compactMember(item) {
  if (!item || String(item.cognitoId || '').startsWith('__')) return item;
  const type = String(item.userType || '').trim().toLowerCase();
  if (type && type !== 'member' && type !== 'staff') return item;
  const next = { ...item };
  const drop = type === 'staff'
    ? MEMBER_DROP.filter((key) => key !== 'role')
    : MEMBER_DROP;
  for (const key of drop) delete next[key];
  const linkId = String(next.paymentLinkId || '');
  if (!linkId || linkId.startsWith('sub_')) delete next.paymentLinkId;
  if (next.dateOfBirth === '1995-01-15') delete next.dateOfBirth;
  for (const [key, value] of Object.entries(next)) {
    if (value === '' || value == null) delete next[key];
  }
  return next;
}

async function putMember(item) {
  const row = normalizeMemberRow(item);
  if (!row.institutionId || !row.memberId) {
    throw new Error('Member requires institutionId and memberId');
  }
  await client.send(new PutCommand({ TableName: MEMBERS, Item: row }));
  return row;
}

async function getMemberById(memberId, institution = fallbackInstitution()) {
  if (!memberId || isReservedProfileId(memberId)) return null;
  const out = await client.send(
    new GetCommand({
      TableName: MEMBERS,
      Key: { institutionId: institution, memberId },
    }),
  );
  if (out.Item) return out.Item;
  const byCognito = await client.send(
    new QueryCommand({
      TableName: MEMBERS,
      IndexName: 'cognitoId-index',
      KeyConditionExpression: 'cognitoId = :cognitoId',
      ExpressionAttributeValues: { ':cognitoId': memberId },
      Limit: 5,
    }),
  );
  const hit = (byCognito.Items || []).find(
    (row) => String(row.institutionId || row.institution) === String(institution),
  );
  return hit || (byCognito.Items || [])[0] || null;
}

async function deleteMember(memberId, institution = fallbackInstitution()) {
  const existing = await getMemberById(memberId, institution);
  const keyId = existing?.memberId || memberId;
  await client.send(
    new DeleteCommand({
      TableName: MEMBERS,
      Key: { institutionId: institution, memberId: keyId },
    }),
  );
  return existing;
}

async function listMembersPage(institution = fallbackInstitution(), opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 0, 0), 500);
  const status = String(opts.status || 'all').trim().toUpperCase();
  const q = String(opts.q || opts.search || '').trim().toLowerCase();
  const userType = String(opts.userType || '').trim().toLowerCase();
  const staffOnly = userType === 'staff';
  let ExclusiveStartKey = opts.cursor || undefined;
  const items = [];
  const membershipStatuses = new Set(['ACTIVE', 'EXPIRED', 'SUSPENDED']);
  const useStatusIndex = !q && !staffOnly && status && status !== 'ALL' && membershipStatuses.has(status);

  if (useStatusIndex) {
    const statusKey = `${institution}#${status}`;
    do {
      const out = await client.send(
        new QueryCommand({
          TableName: MEMBERS,
          IndexName: 'statusKey-memberId-index',
          KeyConditionExpression: 'statusKey = :statusKey',
          ExpressionAttributeValues: { ':statusKey': statusKey },
          ExclusiveStartKey,
          Limit: limit || undefined,
        }),
      );
      items.push(...(out.Items || []));
      ExclusiveStartKey = out.LastEvaluatedKey;
      if (limit && items.length >= limit) break;
    } while (ExclusiveStartKey && (!limit || items.length < limit));
  } else {
    const values = { ':institutionId': institution };
    const filters = [];
    if (q) {
      values[':q'] = q;
      filters.push(
        '(contains(nameLower, :q) OR begins_with(nameSort, :q) OR contains(phone, :q) OR contains(email, :q) OR contains(emailId, :q) OR contains(memberCode, :q) OR contains(deviceEnrollId, :q))',
      );
    }
    if (status && status !== 'ALL' && !staffOnly) {
      values[':status'] = status;
      filters.push('(subscriptionStatus = :status OR membershipStatus = :status OR #st = :status)');
    }
    if (staffOnly) {
      values[':staff'] = 'staff';
      filters.push('(userType = :staff OR cognitoRole = :staff)');
    }
    const exprNames = status && status !== 'ALL' && !staffOnly ? { '#st': 'status' } : undefined;
    const queryLimit = limit
      ? Math.min(Math.max(limit * (filters.length ? 8 : 1), limit), 200)
      : undefined;
    do {
      const out = await client.send(
        new QueryCommand({
          TableName: MEMBERS,
          KeyConditionExpression: 'institutionId = :institutionId',
          FilterExpression: filters.length ? filters.join(' AND ') : undefined,
          ExpressionAttributeValues: values,
          ExpressionAttributeNames: exprNames,
          ExclusiveStartKey,
          Limit: queryLimit,
        }),
      );
      items.push(...(out.Items || []));
      ExclusiveStartKey = out.LastEvaluatedKey;
      if (limit && items.length >= limit) break;
    } while (ExclusiveStartKey && (!limit || items.length < limit));
  }

  // A short page (1 MB cap) followed by another page can overshoot the limit; resume after the last kept row.
  if (limit && items.length > limit) {
    items.length = limit;
    const last = items[limit - 1];
    ExclusiveStartKey = useStatusIndex
      ? { institutionId: last.institutionId, memberId: last.memberId, statusKey: last.statusKey }
      : { institutionId: last.institutionId, memberId: last.memberId };
  }

  let rows = items;
  if (staffOnly) {
    rows = rows.filter((row) => peopleUserType(row) === 'staff');
  } else if (!opts.includeStaff) {
    rows = rows.filter(isGymMemberRow);
  }
  return {
    items: rows,
    cursor: ExclusiveStartKey || null,
  };
}

async function listMembers(institution = fallbackInstitution(), opts = {}) {
  const items = [];
  let cursor;
  do {
    const page = await listMembersPage(institution, { limit: 250, cursor, includeStaff: opts.includeStaff });
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

async function putProfile(input) {
  const item = await persistRowPhoto(input);
  if (usesMembersTable(item)) {
    return putMember(item);
  }
  const row = compactMember(item);
  await client.send(new PutCommand({ TableName: PROFILE, Item: row }));
  return row;
}

async function getProfile(cognitoId, institution = fallbackInstitution()) {
  if (isReservedProfileId(cognitoId) || !isTekkzyFitInstitution(institution)) {
    const out = await client.send(
      new GetCommand({ TableName: PROFILE, Key: { institution, cognitoId } }),
    );
    return out.Item || null;
  }
  const member = await getMemberById(cognitoId, institution);
  if (member) return member;
  const out = await client.send(
    new GetCommand({ TableName: PROFILE, Key: { institution, cognitoId } }),
  );
  return out.Item || null;
}

async function deleteProfile(cognitoId, institution = fallbackInstitution()) {
  if (isTekkzyFitInstitution(institution) && !isReservedProfileId(cognitoId)) {
    await deleteMember(cognitoId, institution).catch(() => null);
  }
  await client.send(
    new DeleteCommand({ TableName: PROFILE, Key: { institution, cognitoId } }),
  ).catch(() => null);
}

async function listProfiles(institution = fallbackInstitution()) {
  if (isTekkzyFitInstitution(institution)) {
    return listMembers(institution);
  }
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: PROFILE,
        KeyConditionExpression: 'institution = :institution',
        ExpressionAttributeValues: { ':institution': institution },
        ExclusiveStartKey,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.filter(isGymMemberRow);
}

function istDay(ms) {
  const n = Number(ms);
  const date = Number.isFinite(n) && n > 0 ? new Date(n > 1e11 ? n : n * 1000) : new Date();
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Only attributes something reads (API mappers, reports, Razorpay sync, table keys/indexes). */
const PAYMENT_FIELDS = [
  'institutionId', 'paymentKey', 'paymentId', 'payDay', 'memberId',
  'client', 'phone', 'planId', 'durationDays',
  'paymentStatus', 'paymentMode', 'amount', 'netAmount', 'grossAmount', 'feeAmount',
  'paymentDate', 'startDate', 'renewDate',
  'paymentLinkUrl', 'razorpaySubscriptionId', 'razorpayPaymentLinkId', 'razorpayPaymentId',
  'paymentCode', 'invoiceNumber', 'notes', 'createdAtIso',
];

/**
 * Adds the key attributes (institutionId + paymentKey "YYYY-MM-DD#paymentId", IST pay day), folds legacy
 * duplicate names into one attribute each, and drops everything not in PAYMENT_FIELDS.
 */
function paymentRow(item) {
  const institutionId = String(item.institutionId || item.institution || fallbackInstitution());
  const paymentId = String(item.paymentId || item.paymentCode || `pay-${Date.now().toString(36)}`);
  const paymentDate = Number(item.paymentDate || item.paidAt || item.createdAt) || Date.now();
  const payDay = istDay(paymentDate);
  const full = {
    ...item,
    institutionId,
    paymentId,
    payDay,
    paymentKey: `${payDay}#${paymentId}`,
    memberId: String(item.memberId || item.cognitoId || ''),
    client: item.client || item.userName || item.memberName,
    phone: item.phone || item.phoneNumber,
    paymentStatus: String(item.paymentStatus || item.status || 'PENDING').toUpperCase(),
    paymentMode: item.paymentMode || item.method || item.paymentMethod,
    paymentDate,
    startDate: item.startDate || item.joinDate,
    renewDate: item.renewDate || item.rePaymentDate,
    createdAtIso: item.createdAtIso || new Date(Number(item.createdAt) || paymentDate).toISOString(),
  };
  if (full.paymentCode === paymentId) delete full.paymentCode;
  const row = {};
  for (const key of PAYMENT_FIELDS) {
    const value = full[key];
    if (value !== undefined && value !== null && value !== '') row[key] = value;
  }
  return row;
}

async function putPayment(item) {
  const row = paymentRow(item);
  await client.send(new PutCommand({ TableName: PAYMENT, Item: row }));
  const oldKey = String(item.paymentKey || '');
  if (oldKey && oldKey !== row.paymentKey && String(item.institutionId || row.institutionId) === row.institutionId) {
    if (oldKey.endsWith(`#${row.paymentId}`)) {
      await client.send(new DeleteCommand({ TableName: PAYMENT, Key: { institutionId: row.institutionId, paymentKey: oldKey } }));
    }
  }
  return row;
}

async function getPaymentById(paymentId) {
  if (!paymentId) return null;
  const out = await client.send(
    new QueryCommand({
      TableName: PAYMENT,
      IndexName: 'paymentId-index',
      KeyConditionExpression: 'paymentId = :id',
      ExpressionAttributeValues: { ':id': String(paymentId) },
      Limit: 1,
    }),
  );
  return out.Items?.[0] || null;
}

/** Kept for older call sites: (cognitoId, paymentId) → lookup by paymentId. */
async function getPayment(_cognitoId, paymentId) {
  return getPaymentById(paymentId);
}

async function paymentBySubscription(subscriptionId) {
  if (!subscriptionId) return [];
  const out = await client.send(
    new QueryCommand({
      TableName: PAYMENT,
      IndexName: 'razorpaySubscriptionId-index',
      KeyConditionExpression: 'razorpaySubscriptionId = :sub',
      ExpressionAttributeValues: { ':sub': String(subscriptionId) },
    }),
  );
  return (out.Items || []).sort((a, b) => String(b.paymentKey).localeCompare(String(a.paymentKey)));
}

function daysAgo(n) {
  return istDay(Date.now() - Number(n || 0) * 86400000);
}

function encodeCursor(key) {
  return key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null;
}

function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function dayRange(opts = {}) {
  const month = String(opts.month || '').trim();
  if (/^\d{4}-\d{2}$/.test(month)) return { from: `${month}-01`, to: `${month}-31` };
  const from = String(opts.from || '').slice(0, 10);
  const to = String(opts.to || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '0000-00-00', to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '9999-12-31' };
  }
  return null;
}

/** Newest first. opts: { month: 'YYYY-MM' } | { from, to } (YYYY-MM-DD), limit, cursor. */
async function listPaymentsPage(institution = fallbackInstitution(), opts = {}) {
  const range = dayRange(opts);
  const limit = Math.min(Math.max(Number(opts.limit) || 0, 0), 1000);
  const values = { ':inst': String(institution) };
  let condition = 'institutionId = :inst';
  if (range) {
    condition += ' AND paymentKey BETWEEN :from AND :to';
    values[':from'] = `${range.from}#`;
    values[':to'] = `${range.to}#\uffff`;
  }
  const items = [];
  let ExclusiveStartKey = decodeCursor(opts.cursor);
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: PAYMENT,
        KeyConditionExpression: condition,
        ExpressionAttributeValues: values,
        ScanIndexForward: false,
        ExclusiveStartKey,
        Limit: limit ? limit - items.length : undefined,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey && (!limit || items.length < limit));
  return { items, cursor: encodeCursor(ExclusiveStartKey) };
}

async function listPayments(institution = fallbackInstitution(), opts = {}) {
  const { items } = await listPaymentsPage(institution, { ...opts, limit: 0, cursor: undefined });
  return items;
}

async function paymentsForMember(memberId) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: PAYMENT,
        IndexName: 'memberId-paymentKey-index',
        KeyConditionExpression: 'memberId = :m',
        ExpressionAttributeValues: { ':m': String(memberId) },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const BRIDGE_ID = '__devicebridge__';
const CMD_PREFIX = '__devicecmd_';
const RES_PREFIX = '__deviceres_';
const PLAN_PREFIX = '__plan_';

async function queryPrefix(institution, prefix) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: PROFILE,
        KeyConditionExpression: 'institution = :institution AND begins_with(cognitoId, :prefix)',
        ExpressionAttributeValues: { ':institution': institution, ':prefix': prefix },
        ExclusiveStartKey,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function putBridge(institution, data) {
  return putProfile({
    institution,
    cognitoId: BRIDGE_ID,
    userType: 'device-bridge',
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

async function getBridge(institution) {
  return getProfile(BRIDGE_ID, institution);
}

async function deleteBridge(institution) {
  await deleteProfile(BRIDGE_ID, institution);
}

async function listDeviceCmds(institution) {
  return queryPrefix(institution, CMD_PREFIX);
}

async function pruneStaleDeviceRows(institution, maxAgeMs = 120_000) {
  const rows = [
    ...(await queryPrefix(institution, CMD_PREFIX)),
    ...(await queryPrefix(institution, RES_PREFIX)),
  ];
  const now = Date.now();
  await Promise.all(rows.map(async (row) => {
    const ts = new Date(row.createdAt || 0).getTime();
    if (!ts || now - ts > maxAgeMs) {
      await deleteProfile(row.cognitoId, institution);
    }
  }));
}

async function getDeviceResult(institution, id) {
  return getProfile(`${RES_PREFIX}${id}`, institution);
}

async function listPlans(institution) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: PRODUCT,
        KeyConditionExpression: 'institution = :institution',
        ExpressionAttributeValues: { ':institution': institution },
        ExclusiveStartKey,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getPlan(institution, id) {
  const productId = String(id || '').trim();
  if (!productId) return null;
  const out = await client.send(
    new GetCommand({ TableName: PRODUCT, Key: { institution, productId } }),
  );
  return out.Item || null;
}

async function putPlan(item) {
  await client.send(new PutCommand({ TableName: PRODUCT, Item: item }));
  return item;
}

async function deletePlan(institution, id) {
  const productId = String(id || '').trim();
  if (!productId) return;
  await client.send(new DeleteCommand({ TableName: PRODUCT, Key: { institution, productId } }));
}

async function listReports(institution) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: REPORT,
        KeyConditionExpression: 'institution = :institution',
        ExpressionAttributeValues: { ':institution': institution },
        ExclusiveStartKey,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getReport(institution, monthKey) {
  const out = await client.send(
    new GetCommand({ TableName: REPORT, Key: { institution, cognitoIdAndMonth: monthKey } }),
  );
  return out.Item || null;
}

async function putReport(item) {
  await client.send(new PutCommand({ TableName: REPORT, Item: item }));
  return item;
}

async function listExpenses(institution) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(
      new QueryCommand({
        TableName: EXPENSE,
        KeyConditionExpression: 'institutionId = :institutionId',
        ExpressionAttributeValues: { ':institutionId': institution },
        ExclusiveStartKey,
        ScanIndexForward: false,
      }),
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getExpense(institution, id) {
  const expenseId = String(id || '').trim();
  if (!expenseId) return null;
  const out = await client.send(
    new GetCommand({ TableName: EXPENSE, Key: { institutionId: institution, expenseId } }),
  );
  return out.Item || null;
}

async function putExpense(item) {
  await client.send(new PutCommand({ TableName: EXPENSE, Item: item }));
  return item;
}

async function deleteExpense(institution, id) {
  const expenseId = String(id || '').trim();
  if (!expenseId) return;
  await client.send(
    new DeleteCommand({ TableName: EXPENSE, Key: { institutionId: institution, expenseId } }),
  );
}

async function getCodegen(institution) {
  const out = await codegenClient.send(
    new GetCommand({
      TableName: CODEGEN,
      Key: { institutionid: institution, index: '0' },
    }),
  );
  return out.Item || null;
}

async function putCodegen(item) {
  await codegenClient.send(new PutCommand({ TableName: CODEGEN, Item: item }));
  return item;
}

module.exports = {
  fallbackInstitution,
  tekkzyFitInstitutions,
  isTekkzyFitInstitution,
  isStaffProfile,
  isGymMemberRow,
  putProfile,
  getProfile,
  deleteProfile,
  listProfiles,
  putMember,
  getMemberById,
  deleteMember,
  listMembers,
  listMembersPage,
  putPayment,
  paymentRow,
  daysAgo,
  getPayment,
  getPaymentById,
  paymentBySubscription,
  listPayments,
  listPaymentsPage,
  paymentsForMember,
  BRIDGE_ID,
  CMD_PREFIX,
  RES_PREFIX,
  PLAN_PREFIX,
  putBridge,
  getBridge,
  deleteBridge,
  listDeviceCmds,
  pruneStaleDeviceRows,
  getDeviceResult,
  listPlans,
  getPlan,
  putPlan,
  deletePlan,
  listReports,
  getReport,
  putReport,
  listExpenses,
  getExpense,
  putExpense,
  deleteExpense,
  getCodegen,
  putCodegen,
};
