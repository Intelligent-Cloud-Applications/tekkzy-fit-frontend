import type { PaymentOrder, PaymentOrderInput, PaymentProvider, PaymentVerifyInput } from './types';

/**
 * Razorpay lives on the server.
 * The browser only asks the API to create an order. The key secret and
 * webhook secret never ship in the frontend bundle.
 *
 * Webhook:
 *   Razorpay → POST /api/payments/webhook → verify signature
 *   → update payment → update membership → sync device permission
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  constructor(private readonly apiBase: string) {}

  async createOrder(input: PaymentOrderInput): Promise<PaymentOrder> {
    const res = await fetch(`${this.apiBase}/payments/razorpay/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error('Razorpay order API is not configured on the server.');
    }
    return res.json() as Promise<PaymentOrder>;
  }

  async verify(input: PaymentVerifyInput): Promise<{ valid: boolean; message: string }> {
    const res = await fetch(`${this.apiBase}/payments/razorpay/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { valid: false, message: 'Verification endpoint unavailable.' };
    }
    return res.json() as Promise<{ valid: boolean; message: string }>;
  }
}
