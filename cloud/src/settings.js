const { json, parseBody, method, institutionFrom } = require('./http');
const dynamo = require('./dynamo');

const DEFAULTS = {
  id: 'settings-1',
  gymName: '',
  legalName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  gateUnlockDurationSeconds: 5,
  duplicateScanCooldownSeconds: 30,
  allowExpired: false,
  allowSuspended: false,
  unknownFacePolicy: 'DENY',
  offlineModeEnabled: true,
  reminderDays: [7, 3, 2, 1, 0],
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  primaryColor: 'red',
};

function normalizePrimary(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'red' || raw === 'yellow' || raw === 'lime') return raw;
  const compact = raw.replace(/[^a-z0-9#]/g, '');
  if (compact.includes('yellow') || compact.includes('gold') || compact === '#f5c400' || compact === '#e6b800' || compact === '#ffcc00') {
    return 'yellow';
  }
  if (compact.includes('lime') || compact.includes('green') || compact === '#7cde2a' || compact === '#84cc16' || compact === '#32cd32') {
    return 'lime';
  }
  return 'red';
}

function info(row) {
  return row?.companyInfo && typeof row.companyInfo === 'object' ? row.companyInfo : {};
}

const INVOICE_FIELDS = ['logo', 'prefix', 'title', 'terms', 'note', 'upiId', 'bankDetails', 'signatory', 'website', 'accent'];

function cleanInvoice(value) {
  const src = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const key of INVOICE_FIELDS) {
    if (src[key] != null) out[key] = String(src[key]);
  }
  if (src.taxPercent != null && src.taxPercent !== '') {
    const pct = Number(src.taxPercent);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) out.taxPercent = pct;
  }
  if (src.showGst != null) out.showGst = Boolean(src.showGst);
  return out;
}

function toSettings(row) {
  const extra = info(row);
  return {
    ...DEFAULTS,
    gymName: String(row.companyName || extra.companyName || ''),
    legalName: String(row.legalName || extra.legalName || row.companyName || extra.companyName || ''),
    phone: String(row.phoneNumber || row.Query_PhoneNumber || extra.ownerPhonenumber || ''),
    email: String(row.emailId || row.Query_EmailId || extra.ownerEmail || ''),
    address: String(row.address || row.Query_Address || extra.address || ''),
    city: String(row.city || extra.city || ''),
    state: String(row.state || extra.state || ''),
    pincode: String(row.pincode || extra.pincode || ''),
    gstin: String(row.gstin || extra.gstin || ''),
    gateUnlockDurationSeconds: Number(row.gateUnlockDurationSeconds ?? DEFAULTS.gateUnlockDurationSeconds),
    duplicateScanCooldownSeconds: Number(row.duplicateScanCooldownSeconds ?? DEFAULTS.duplicateScanCooldownSeconds),
    allowExpired: Boolean(row.allowExpired),
    allowSuspended: Boolean(row.allowSuspended),
    unknownFacePolicy: row.unknownFacePolicy === 'ALLOW' ? 'ALLOW' : 'DENY',
    offlineModeEnabled: row.offlineModeEnabled !== false,
    reminderDays: Array.isArray(row.reminderDays) ? row.reminderDays.map(Number) : DEFAULTS.reminderDays,
    currency: row.currency || DEFAULTS.currency,
    timezone: row.timezone || DEFAULTS.timezone,
    primaryColor: normalizePrimary(row.primaryColor || extra.primaryColor),
    invoice: cleanInvoice(row.invoice),
  };
}

function fromSettings(institution, body, previous) {
  const gymName = String((body.gymName != null ? body.gymName : previous?.companyName) || '').trim();
  const legalName = String((body.legalName != null ? body.legalName : previous?.legalName || gymName) || '').trim();
  const phone = String((body.phone != null ? body.phone : previous?.phoneNumber) || '').trim();
  const email = String((body.email != null ? body.email : previous?.emailId) || '').trim();
  const address = String((body.address != null ? body.address : previous?.address) || '').trim();
  const city = String((body.city != null ? body.city : previous?.city) || '').trim();
  const state = String((body.state != null ? body.state : previous?.state) || '').trim();
  const pincode = String((body.pincode != null ? body.pincode : previous?.pincode) || '').trim();
  const gstin = String((body.gstin != null ? body.gstin : previous?.gstin) || '').trim();
  const primaryColor = normalizePrimary(body.primaryColor ?? previous?.primaryColor ?? info(previous).primaryColor);
  const now = new Date().toISOString();
  return {
    ...(previous || {}),
    institutionid: institution,
    index: '0',
    companyName: gymName,
    legalName,
    phoneNumber: phone,
    emailId: email,
    address,
    city,
    state,
    pincode,
    gstin,
    primaryColor,
    invoice: body.invoice != null ? cleanInvoice({ ...cleanInvoice(previous?.invoice), ...body.invoice }) : cleanInvoice(previous?.invoice),
    Query_PhoneNumber: phone,
    Query_EmailId: email,
    Query_Address: address,
    companyInfo: {
      ...(info(previous)),
      companyName: gymName,
      legalName,
      ownerPhonenumber: phone,
      ownerEmail: email,
      address,
      city,
      state,
      pincode,
      gstin,
      primaryColor,
    },
    institutionType: previous?.institutionType || 'gym',
    status: previous?.status || 'Active',
    isFormFilled: true,
    gateUnlockDurationSeconds: Number(body.gateUnlockDurationSeconds ?? previous?.gateUnlockDurationSeconds ?? 5),
    duplicateScanCooldownSeconds: Number(body.duplicateScanCooldownSeconds ?? previous?.duplicateScanCooldownSeconds ?? 30),
    allowExpired: body.allowExpired != null ? Boolean(body.allowExpired) : Boolean(previous?.allowExpired),
    allowSuspended: body.allowSuspended != null ? Boolean(body.allowSuspended) : Boolean(previous?.allowSuspended),
    unknownFacePolicy: body.unknownFacePolicy === 'ALLOW' ? 'ALLOW' : 'DENY',
    offlineModeEnabled: body.offlineModeEnabled !== false,
    reminderDays: Array.isArray(body.reminderDays) ? body.reminderDays.map(Number) : (previous?.reminderDays || [7, 3, 1, 0]),
    currency: body.currency || previous?.currency || 'INR',
    timezone: body.timezone || previous?.timezone || 'Asia/Kolkata',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

exports.handler = async (event) => {
  if (method(event) === 'OPTIONS') return json(200, { ok: true });
  let body = {};
  try {
    body = parseBody(event);
  } catch {
    body = {};
  }
  const institution = institutionFrom(event, body);
  const verb = method(event);

  try {
    if (verb === 'GET') {
      const row = await dynamo.getCodegen(institution);
      return json(200, row ? toSettings(row) : DEFAULTS);
    }

    if (verb === 'PUT' || verb === 'POST' || verb === 'PATCH') {
      const previous = await dynamo.getCodegen(institution);
      const saved = await dynamo.putCodegen(fromSettings(institution, body, previous));
      return json(200, toSettings(saved));
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('settings', err);
    return json(500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};
