import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import qrcode from 'qrcode-generator';
import { displayPaymentId, formatDate, isPaid, memberDue, billedAmount, methodLabel, paymentBelongsToMember, todayISO, ymd } from './format';
import type { GymSettings, Member, Payment, Plan } from './types';

export type InvoiceReceipt = { date: string; method: string; reference: string; amount: number };

export type InvoiceData = {
  number: string;
  date: string;
  member: Member;
  planName: string;
  durationLabel: string;
  startDate: string;
  expiryDate: string;
  total: number;
  paid: number;
  due: number;
  method: string;
  taxPercent: number;
  receipts: InvoiceReceipt[];
};

const ACCENTS: Record<string, string> = { red: '#B91C1C', yellow: '#A16207', lime: '#3F6212' };

function esc(value?: string | number | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lines(value?: string) {
  return esc(value).replace(/\r?\n/g, '<br/>');
}

function money(n: number) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

export function amountInWords(amount: number) {
  let n = Math.floor(Math.abs(Number(amount) || 0));
  if (!n) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `Rupees ${parts.join(' ')} Only`;
}

function memberRef(member: Member) {
  return member.deviceEnrollId || member.memberCode || member.id.slice(-6).toUpperCase();
}

export function buildInvoiceData(member: Member, payments: Payment[], plans: Plan[], settings?: GymSettings | null): InvoiceData {
  const plan = plans.find((p) => p.id === member.planId || p.id === member.membership?.planId);
  const rows = payments
    .filter((p) => paymentBelongsToMember(p, member))
    .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
  const startDate = ymd(member.startDate || member.membership?.startDate || member.joinDate) || '';
  const expiryDate = memberDue(member) || '';
  const current = rows.filter((p) => {
    if (member.subscriptionId && p.subscriptionId) return p.subscriptionId === member.subscriptionId;
    return !startDate || ymd(p.date) >= startDate;
  });
  const latest = current[0] || rows[0];
  const total = Number(member.amount || member.membership?.price || plan?.price || latest?.amount || 0);
  const paidRows = current.filter(isPaid);
  let paid = paidRows.reduce((sum, p) => sum + billedAmount(p), 0);
  const receipts: InvoiceReceipt[] = paidRows.map((p) => ({
    date: p.date,
    method: methodLabel(p.method),
    reference: displayPaymentId(p),
    amount: billedAmount(p),
  }));
  if (!paid && String(member.paymentStatus || member.membership?.paymentStatus || '').toUpperCase() === 'PAID') {
    paid = total;
    receipts.push({ date: startDate || todayISO(), method: methodLabel(member.paymentMethod) || 'Paid', reference: '—', amount: total });
  }
  const prefix = (settings?.invoice?.prefix || 'INV').trim();
  const cfgTax = Number(settings?.invoice?.taxPercent || 0);
  const days = Number(plan?.durationDays || member.durationDays || 0);
  return {
    number: latest?.invoiceNumber || `${prefix}${memberRef(member)}`,
    date: ymd(latest?.date) || startDate || todayISO(),
    member,
    planName: plan?.name || member.planName || 'Membership fee',
    durationLabel: days ? (days % 30 === 0 ? `${days / 30} month${days === 30 ? '' : 's'}` : `${days} days`) : '',
    startDate,
    expiryDate,
    total,
    paid,
    due: Math.max(0, total - paid),
    method: latest ? methodLabel(latest.method) : member.paymentMethod ? methodLabel(member.paymentMethod) : '',
    taxPercent: settings?.invoice?.showGst === false ? 0 : cfgTax,
    receipts,
  };
}

function upiQrSvg(upiId: string, payee: string, amount: number, note: string) {
  const params = new URLSearchParams({ pa: upiId, pn: payee, am: amount.toFixed(2), cu: 'INR', tn: note });
  const qr = qrcode(0, 'M');
  qr.addData(`upi://pay?${params.toString()}`);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

export function buildPaymentInvoiceData(member: Member, payment: Payment, plans: Plan[], settings?: GymSettings | null): InvoiceData {
  const plan = plans.find((p) => p.id === payment.planId)
    || plans.find((p) => p.id === member.planId || p.id === member.membership?.planId);
  const total = billedAmount(payment);
  const paid = isPaid(payment) ? total : 0;
  const prefix = (settings?.invoice?.prefix || 'INV').trim();
  const cfgTax = Number(settings?.invoice?.taxPercent || 0);
  const days = Number(plan?.durationDays || member.durationDays || 0);
  const startDate = ymd(payment.date) || todayISO();
  const code = displayPaymentId(payment).replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return {
    number: payment.invoiceNumber || `${prefix}${memberRef(member)}-${code || startDate.replace(/-/g, '')}`,
    date: startDate,
    member,
    planName: plan?.name || member.planName || 'Membership fee',
    durationLabel: days ? (days % 30 === 0 ? `${days / 30} month${days === 30 ? '' : 's'}` : `${days} days`) : '',
    startDate,
    expiryDate: ymd(payment.renewDate) || memberDue(member) || '',
    total,
    paid,
    due: Math.max(0, total - paid),
    method: methodLabel(payment.method),
    taxPercent: settings?.invoice?.showGst === false ? 0 : cfgTax,
    receipts: paid ? [{ date: startDate, method: methodLabel(payment.method), reference: displayPaymentId(payment), amount: total }] : [],
  };
}

export function invoiceHtml(data: InvoiceData, settings?: GymSettings | null) {
  const cfg = settings?.invoice || {};
  const accent = ACCENTS[String(settings?.primaryColor || 'red')] || ACCENTS.red;
  const gymName = settings?.gymName || settings?.legalName || 'Your Gym';
  const legal = settings?.legalName && settings.legalName !== gymName ? settings.legalName : '';
  const address = [settings?.address, settings?.city, [settings?.state, settings?.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  const contact = [settings?.phone ? `Tel: ${settings.phone}` : '', settings?.email, cfg.website].filter(Boolean).map((v) => esc(v)).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  const initials = gymName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const logo = cfg.logo
    ? `<img class="logo" src="${esc(cfg.logo)}"/>`
    : `<div class="logo mono">${esc(initials)}</div>`;
  const status = data.due <= 0 && data.total > 0 ? 'PAID' : data.paid > 0 ? 'PARTIALLY PAID' : 'UNPAID';
  const statusColor = status === 'PAID' ? '#16A34A' : status === 'UNPAID' ? '#EF4444' : '#F59E0B';
  const m = data.member;
  const tax = data.taxPercent > 0 ? data.total - data.total / (1 + data.taxPercent / 100) : 0;
  const taxable = data.total - tax;
  const half = data.taxPercent / 2;
  const title = cfg.title || (data.taxPercent > 0 ? 'Tax Invoice' : 'Invoice');
  const period = data.startDate || data.expiryDate ? `${formatDate(data.startDate)} to ${formatDate(data.expiryDate)}` : '—';
  const qr = cfg.upiId && data.due > 0 ? upiQrSvg(cfg.upiId, gymName, data.due, `Invoice ${data.number}`) : '';
  const hasPayTo = Boolean(cfg.upiId || cfg.bankDetails);

  const receiptsHtml = data.receipts.length
    ? `<table class="mini"><thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th class="r">Amount</th></tr></thead><tbody>${
      data.receipts.map((r) => `<tr><td>${esc(formatDate(r.date))}</td><td>${esc(r.method)}</td><td>${esc(r.reference)}</td><td class="r">${money(r.amount)}</td></tr>`).join('')
    }</tbody></table>`
    : '<div class="muted small">No payment received yet.</div>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Roboto, Arial, sans-serif; color: #1F2937; font-size: 12px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; min-height: 297mm; padding: 11mm 13mm 22mm; }
  .muted { color: #6B7280; }
  .small { font-size: 11px; }
  .r { text-align: right; }
  .c { text-align: center; }
  .cap { font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #6B7280; margin-bottom: 5px; }

  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
  .brand { display: flex; gap: 14px; align-items: flex-start; max-width: 62%; }
  .logo { width: 72px; height: 72px; object-fit: contain; }
  .mono { border-radius: 8px; background: #111827; color: #fff; font-weight: 800; font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .gym { font-size: 21px; font-weight: 800; color: #111827; letter-spacing: -0.2px; }
  .title { text-align: right; }
  .title h1 { margin: 0 0 6px; white-space: nowrap; font-size: 28px; font-weight: 300; letter-spacing: 4px; text-transform: uppercase; color: #111827; }
  .meta { border-collapse: collapse; margin-left: auto; }
  .meta td { padding: 2px 0 2px 16px; font-size: 11.5px; }
  .meta td:first-child { color: #6B7280; text-align: right; }
  .meta td:last-child { font-weight: 700; color: #111827; text-align: right; }
  .rule { height: 3px; background: ${accent}; margin: 10px 0 12px; }

  .grid3 { display: flex; gap: 12px; }
  .box { flex: 1; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 12px; }
  .name { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 2px; }
  .duebox { flex: 0 0 170px; border-radius: 6px; padding: 12px 14px; background: #111827; color: #fff; }
  .duebox .cap { color: #9CA3AF; }
  .duebox .amt { font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
  .chip { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 800; letter-spacing: 1px; background: ${statusColor}; color: #fff; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items th { background: #F3F4F6; color: #374151; font-size: 9.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 8px 10px; text-align: left; border-top: 1px solid #D1D5DB; border-bottom: 1px solid #D1D5DB; }
  table.items td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
  table.items .desc b { color: #111827; font-size: 12.5px; }

  .lower { display: flex; gap: 22px; margin-top: 10px; }
  .left { flex: 1; }
  .totals { width: 270px; border-collapse: collapse; align-self: flex-start; }
  table.items th.r { text-align: right; }
  table.items th.c { text-align: center; }
  .bottom { display: flex; gap: 22px; align-items: flex-end; margin-top: 12px; }
  .bottom .left { flex: 1; }
  .totals td { padding: 4px 0; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .totals .sep td { border-top: 1px solid #E5E7EB; }
  .totals .grand td { border-top: 2px solid #111827; padding-top: 7px; font-size: 15px; font-weight: 800; color: #111827; }
  .totals .bal td { background: ${data.due > 0 ? '#FEF2F2' : '#F0FDF4'}; color: ${data.due > 0 ? '#B91C1C' : '#15803D'}; font-weight: 800; padding: 7px 8px; }
  .words { margin-top: 10px; padding: 8px 10px; background: #F9FAFB; border-left: 3px solid ${accent}; font-size: 11.5px; }
  .section { margin-top: 10px; }
  table.mini { width: 100%; border-collapse: collapse; }
  table.mini th { font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #6B7280; text-align: left; padding: 4px 6px; border-bottom: 1px solid #E5E7EB; }
  table.mini td { padding: 4px 6px; border-bottom: 1px dashed #E5E7EB; font-size: 11px; }
  .pay { display: flex; gap: 14px; align-items: flex-start; }
  .qr { width: 104px; height: 104px; padding: 5px; border: 1px solid #E5E7EB; border-radius: 6px; }
  .qr svg { width: 100%; height: 100%; }
  .terms { font-size: 10.5px; line-height: 1.5; color: #4B5563; }
  .sign { display: flex; justify-content: flex-end; }
  .sign > div { min-width: 180px; text-align: center; }
  .sign .dsig { font-family: 'Brush Script MT', 'Segoe Script', 'Dancing Script', cursive; font-style: italic; font-size: 20px; color: #111827; padding: 0 6px 4px; }
  .sign .line { border-top: 1px solid #9CA3AF; padding-top: 5px; font-size: 10.5px; color: #4B5563; letter-spacing: .4px; }
  .sign .tick { color: #15803D; font-weight: 800; }

  .foot { position: absolute; left: 14mm; right: 14mm; bottom: 10mm; border-top: 1px solid #E5E7EB; padding-top: 7px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; font-size: 9px; color: #9CA3AF; line-height: 1.5; }
  .foot b { color: #6B7280; font-weight: 700; }
</style></head><body><div class="page">

  <div class="top">
    <div class="brand">
      ${logo}
      <div>
        <div class="gym">${esc(gymName)}</div>
        ${legal ? `<div class="small">${esc(legal)}</div>` : ''}
        ${address ? `<div class="small muted">${esc(address)}</div>` : ''}
        ${contact ? `<div class="small muted">${contact}</div>` : ''}
        ${settings?.gstin ? `<div class="small"><b>GSTIN:</b> ${esc(settings.gstin)}</div>` : ''}
      </div>
    </div>
    <div class="title">
      <h1>${esc(title)}</h1>
      <table class="meta">
        <tr><td>Invoice No.</td><td>${esc(data.number)}</td></tr>
        <tr><td>Invoice Date</td><td>${esc(formatDate(data.date))}</td></tr>
        <tr><td>Member ID</td><td>${esc(memberRef(m))}</td></tr>
        ${data.expiryDate ? `<tr><td>Valid Till</td><td>${esc(formatDate(data.expiryDate))}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <div class="rule"></div>

  <div class="grid3">
    <div class="box">
      <div class="cap">Billed To</div>
      <div class="name">${esc(m.name)}</div>
      ${m.phone ? `<div>${esc(m.phone)}</div>` : ''}
      ${m.email ? `<div class="muted">${esc(m.email)}</div>` : ''}
    </div>
    <div class="box">
      <div class="cap">Membership</div>
      <div class="name">${esc(data.planName)}</div>
      <div>${esc(period)}</div>
      ${data.method ? `<div class="muted">Payment mode: ${esc(data.method)}</div>` : ''}
    </div>
    <div class="duebox">
      <div class="cap">Balance Due</div>
      <div class="amt">${money(data.due)}</div>
      <div class="chip">${status}</div>
    </div>
  </div>

  <table class="items">
    <thead><tr><th style="width:26px">#</th><th>Description</th><th style="width:128px">Period</th><th class="c" style="width:30px">Qty</th><th class="r" style="width:78px">Rate</th><th class="r" style="width:84px">Amount</th></tr></thead>
    <tbody><tr>
      <td>1</td>
      <td class="desc"><b>${esc(data.planName)}</b><div class="muted small">Gym membership${data.durationLabel ? ` · ${esc(data.durationLabel)}` : ''}</div></td>
      <td>${esc(period)}</td>
      <td class="c">1</td>
      <td class="r">${money(tax > 0 ? taxable : data.total)}</td>
      <td class="r"><b>${money(tax > 0 ? taxable : data.total)}</b></td>
    </tr></tbody>
  </table>

  <div class="lower">
    <div class="left">
      <div class="cap">Payments Received</div>
      ${receiptsHtml}
      <div class="words"><span class="muted">Amount in words:</span> <b>${esc(amountInWords(data.total))}</b></div>
      ${hasPayTo ? `<div class="section"><div class="cap">${qr ? 'Scan to Pay Balance' : 'Payment Details'}</div><div class="pay">
        ${qr ? `<div class="qr">${qr}</div>` : ''}
        <div class="small">${cfg.upiId ? `<div><b>UPI ID:</b> ${esc(cfg.upiId)}</div>` : ''}${cfg.bankDetails ? `<div style="margin-top:3px">${lines(cfg.bankDetails)}</div>` : ''}</div>
      </div></div>` : ''}
    </div>
    <table class="totals">
      <tr><td class="muted">Subtotal</td><td>${money(taxable)}</td></tr>
      ${tax > 0 ? `<tr><td class="muted">CGST @ ${half}%</td><td>${money(tax / 2)}</td></tr><tr><td class="muted">SGST @ ${half}%</td><td>${money(tax / 2)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td>${money(data.total)}</td></tr>
      <tr class="sep"><td class="muted">Amount Paid</td><td>${money(data.paid)}</td></tr>
      <tr class="bal"><td>Balance Due</td><td>${money(data.due)}</td></tr>
    </table>
  </div>

  <div class="bottom">
    <div class="left">
      ${cfg.note ? `<div class="cap">Notes</div><div class="terms">${lines(cfg.note)}</div>` : ''}
      ${cfg.terms ? `<div class="cap" style="margin-top:10px">Terms &amp; Conditions</div><div class="terms">${lines(cfg.terms)}</div>` : ''}
    </div>
    <div class="sign"><div>
      <div class="dsig">${esc(cfg.signatory || gymName)}</div>
      <div class="line"><span class="tick">&#10003;</span> Digitally signed</div>
    </div></div>
  </div>

  <div class="foot">
    <div>This is a computer-generated invoice and does not require a physical signature.<br/>
    Generated by <b>TekkzyFit Gym Management App</b> &middot; Powered by <b>Tekkzy Intelligent Cloud Application Private Limited</b></div>
    <div class="r">${esc(data.number)}<br/>Page 1 of 1</div>
  </div>
</div></body></html>`;
}

export async function createInvoicePdf(data: InvoiceData, settings?: GymSettings | null) {
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(data, settings), width: 595, height: 842 });
  const dir = `${FileSystem.cacheDirectory}invoices/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const safe = data.number.replace(/[^A-Za-z0-9_-]/g, '') || 'Invoice';
  const target = `${dir}Invoice-${safe}.pdf`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export function invoiceMessage(data: InvoiceData, settings?: GymSettings | null) {
  const gym = settings?.gymName || 'our gym';
  const due = data.due > 0 ? ` Balance due: ${money(data.due)}.` : ' Fully paid, thank you!';
  return `Hi ${data.member.name}, please find your invoice ${data.number} from ${gym} for ${data.planName} (${formatDate(data.startDate)} – ${formatDate(data.expiryDate)}). Total: ${money(data.total)}.${due}`;
}

export async function shareInvoiceWhatsApp(data: InvoiceData, settings?: GymSettings | null) {
  const file = await createInvoicePdf(data, settings);
  const text = invoiceMessage(data, settings);
  const native = Platform.OS === 'android' ? NativeModules.DeskKeepAlive : null;
  if (native?.shareToWhatsApp) {
    await native.shareToWhatsApp(file, data.member.phone || '', text);
    return;
  }
  await Sharing.shareAsync(file, { mimeType: 'application/pdf', dialogTitle: 'Share invoice', UTI: 'com.adobe.pdf' });
}

export async function emailInvoice(data: InvoiceData, settings?: GymSettings | null) {
  const file = await createInvoicePdf(data, settings);
  if (!(await MailComposer.isAvailableAsync())) {
    await Sharing.shareAsync(file, { mimeType: 'application/pdf', dialogTitle: 'Send invoice' });
    return;
  }
  await MailComposer.composeAsync({
    recipients: data.member.email ? [data.member.email] : [],
    subject: `Invoice ${data.number} – ${settings?.gymName || 'Gym membership'}`,
    body: `${invoiceMessage(data, settings)}\n\nRegards,\n${settings?.gymName || ''}`,
    attachments: [file],
  });
}

export async function shareInvoiceFile(data: InvoiceData, settings?: GymSettings | null) {
  const file = await createInvoicePdf(data, settings);
  await Sharing.shareAsync(file, { mimeType: 'application/pdf', dialogTitle: 'Share invoice', UTI: 'com.adobe.pdf' });
}
