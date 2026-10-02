/**
 * Server-side Razorpay adapter.
 *
 * Webhook:
 *   Razorpay → POST /api/payments/webhook
 *   → verify signature with RAZORPAY_WEBHOOK_SECRET
 *   → update payment
 *   → update membership
 *   → queue device permission sync
 *
 * Never send RAZORPAY_KEY_SECRET to the browser.
 */
export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function verifyWebhookSignature(_payload: string, _signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  // TODO: crypto.createHmac('sha256', secret).update(payload).digest('hex')
  // compared against x-razorpay-signature once keys exist.
  return false;
}

export function createRazorpayOrder(_input: { amount: number; receipt: string }): never {
  throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.');
}
