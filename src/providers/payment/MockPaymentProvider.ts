import { newId } from '@/lib/format';
import type { PaymentOrder, PaymentOrderInput, PaymentProvider, PaymentVerifyInput } from './types';

export class MockPaymentProvider implements PaymentProvider {
  async createOrder(input: PaymentOrderInput): Promise<PaymentOrder> {
    return {
      id: newId('order'),
      amount: input.amount,
      currency: 'INR',
      status: 'created',
    };
  }

  async verify(_input: PaymentVerifyInput): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: 'Mock payment accepted. No Razorpay call was made.' };
  }
}

export const mockPaymentProvider = new MockPaymentProvider();
