import { mockPaymentProvider } from './MockPaymentProvider';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider';
import type { PaymentProvider } from './types';

export type { PaymentProvider, PaymentOrder, PaymentOrderInput } from './types';

export function getPaymentProvider(): PaymentProvider {
  const mode = import.meta.env.VITE_PAYMENT_PROVIDER ?? 'mock';
  if (mode === 'razorpay') {
    return new RazorpayPaymentProvider(import.meta.env.VITE_API_URL || '/api');
  }
  return mockPaymentProvider;
}
