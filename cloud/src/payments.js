const { json, parseBody, requireGymKey, pathId, method, institutionFrom } = require('./http');
const dynamo = require('./dynamo');
const { createSubscription, mapSubscriptionStatus } = require('./razorpay');
const { toPayment, paymentItem, newId, prepaidCharge } = require('./map');

function isRealPayment(p) {
  if (!(Number(p.amount) > 0)) return false;
  if (/^DEV-CASH-/i.test(String(p.invoiceNumber || ''))) return false;
  if (/created on terminal/i.test(String(p.notes || ''))) return false;
  return true;
}

function matchesMode(method, mode) {
  if (!mode || mode === 'ALL') return true;
  const m = String(method || '').toUpperCase();
  const offline = m === 'CASH' || m === 'UPI';
  if (mode === 'OFFLINE') return offline;
  if (mode === 'ONLINE') return !offline;
  return m === mode;
}

function summarize(rows) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const paid = rows.filter((p) => p.status === 'PAID');
  const amount = (p) => Number(p.amount) || 0;
  return {
    count: rows.length,
    revenue: paid.reduce((s, p) => s + amount(p), 0),
    today: paid.filter((p) => p.date === today).reduce((s, p) => s + amount(p), 0),
    paid: paid.length,
    pending: rows.filter((p) => p.status === 'PENDING').length,
    failed: rows.filter((p) => p.status === 'FAILED').length,
  };
}

exports.handler = async (event) => {
  if (method(event) === 'OPTIONS') return json(200, { ok: true });
  if (!requireGymKey(event)) return json(401, { error: 'Unauthorized' });

  try {
    const verb = method(event);
    const id = pathId(event);
    const body = verb === 'POST' ? parseBody(event) : {};
    const institution = institutionFrom(event, body);

    if (verb === 'GET' && !id) {
      const q = event.queryStringParameters || {};
      if (q.memberId) {
        const rows = await dynamo.paymentsForMember(q.memberId);
        return json(200, rows.map(toPayment));
      }
      const opts = { month: q.month, from: q.from, to: q.to };
      if (q.summary === '1') {
        const rows = (await dynamo.listPayments(institution, opts)).map(toPayment).filter(isRealPayment);
        return json(200, summarize(rows));
      }
      if (q.page === '1' || q.cursor || q.limit) {
        const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
        const search = String(q.q || '').trim().toLowerCase();
        const status = String(q.status || '').trim().toUpperCase();
        const mode = String(q.method || '').trim().toUpperCase();
        const cursor = String(q.cursor || '');
        if (search || (status && status !== 'ALL') || (mode && mode !== 'ALL') || cursor.startsWith('o.')) {
          const rows = (await dynamo.listPayments(institution, opts))
            .map(toPayment)
            .filter(isRealPayment)
            .filter((p) => !status || status === 'ALL' || p.status === status)
            .filter((p) => matchesMode(p.method, mode))
            .filter((p) => !search || `${p.memberName} ${p.phone} ${p.paymentCode} ${p.id} ${p.invoiceNumber}`.toLowerCase().includes(search));
          const offset = cursor.startsWith('o.') ? Number(cursor.slice(2)) || 0 : 0;
          const items = rows.slice(offset, offset + limit);
          return json(200, { items, cursor: offset + limit < rows.length ? `o.${offset + limit}` : null, total: rows.length });
        }
        const page = await dynamo.listPaymentsPage(institution, { ...opts, limit, cursor: cursor.replace(/^k\./, '') || undefined });
        return json(200, {
          items: page.items.map(toPayment).filter(isRealPayment),
          cursor: page.cursor ? `k.${page.cursor}` : null,
        });
      }
      const rows = await dynamo.listPayments(institution, opts);
      return json(200, rows.map(toPayment));
    }

    if (verb === 'GET' && id) {
      let row = await dynamo.getPaymentById(id);
      if (!row && /^sub_/.test(id)) row = (await dynamo.paymentBySubscription(id))[0] || null;
      if (!row) {
        const rows = await dynamo.listPayments(institution, { from: dynamo.daysAgo(400) });
        row = rows.find((p) =>
          p.paymentCode === id
          || p.razorpayPaymentId === id
          || p.razorpayPaymentLinkId === id
        ) || null;
      }
      if (!row) return json(404, { error: 'Payment not found' });
      return json(200, toPayment(row));
    }

    if (verb === 'POST') {
      const memberId = body.memberId || body.cognitoId;
      if (!memberId) return json(400, { error: 'memberId is required' });
      const profile = await dynamo.getProfile(memberId, institution);
      if (!profile) return json(404, { error: 'Member not found' });
      const phone = String(body.phone || body.phoneNumber || profile.phoneNumber || '').trim();
      const email = String(body.email || body.emailId || profile.emailId || '').trim();
      if (!phone) return json(400, { error: 'Member phone is required to send the payment link' });
      if (!email) return json(400, { error: 'Member email is required to send the payment link' });
      const amount = Number(body.amount ?? profile.amount);
      const durationDays = Number(body.durationDays ?? profile.durationDays ?? 30);
      const paymentId = newId('pay');
      const gymPlanId = body.planId || profile.planId;
      const gymPlan = gymPlanId ? await dynamo.getPlan(institution, gymPlanId) : null;
      const addonAmount = String(profile.paymentStatus || '').toUpperCase() === 'PAID'
        ? 0
        : Number(gymPlan?.addonAmount || 0);
      const charge = prepaidCharge({
        amount,
        addonAmount,
        startDate: body.startDate || profile.joinDate,
        durationDays,
      });
      const link = await createSubscription({
        amount,
        addonAmount: charge.addonAmount,
        addonName: charge.addonName,
        addonDescription: charge.addonDescription,
        name: profile.userName,
        phone,
        email,
        description: `${body.planName || profile.planName || 'Membership'} · Tekkzy Fit`,
        planId: gymPlanId,
        planName: body.planName || profile.planName,
        durationDays,
        period: gymPlan?.billingPeriod,
        interval: gymPlan?.billingInterval,
        startDate: charge.razorpayStartDate,
        notes: {
          institution,
          memberId: profile.memberId || profile.cognitoId,
          cognitoId: profile.cognitoId,
          paymentId,
          planId: String(body.planId || profile.planId || ''),
          durationDays: String(durationDays),
          startDate: String(charge.membershipStart || ''),
          ...(charge.futureStart ? { prepaidStart: '1' } : {}),
        },
      });
      const payment = paymentItem({
        profile,
        planId: body.planId || profile.planId,
        planName: body.planName || profile.planName,
        amount,
        durationDays,
        link,
        paymentId,
      });
      await dynamo.putPayment(payment);
      await dynamo.putProfile({
        ...profile,
        phoneNumber: phone,
        emailId: email,
        paymentStatus: 'PENDING',
        paymentLinkUrl: link.paymentLinkUrl,
        razorpaySubscriptionId: link.subscriptionId,
        subscriptionStatus: mapSubscriptionStatus(link.status) || 'PENDING',
        subscriptionStatusAt: Date.now(),
        lastPaymentId: payment.paymentId,
        amount,
        durationDays,
        planId: body.planId || profile.planId,
        planName: body.planName || profile.planName,
        joinDate: charge.membershipStart || profile.joinDate,
        renewDate: charge.cycleEnd,
        deviceStart: profile.deviceStart || charge.membershipStart || profile.joinDate,
        deviceEnd: charge.cycleEnd,
      });
      return json(201, toPayment(payment));
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('payments', err);
    return json(500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};
