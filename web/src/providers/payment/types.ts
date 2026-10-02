export interface PaymentOrderInput {
  amount: number;
  currency: 'INR';
  receipt: string;
  memberId: string;
  notes?: Record<string, string>;
}

export interface PaymentOrder {
  id: string;
  amount: number;
  currency: 'INR';
  status: 'created' | 'attempted' | 'paid';
  checkoutUrl?: string;
}

export interface PaymentVerifyInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface PaymentProvider {
  createOrder(input: PaymentOrderInput): Promise<PaymentOrder>;
  verify(input: PaymentVerifyInput): Promise<{ valid: boolean; message: string }>;
}

export interface PaymentProviderMeta {
  id: 'mock' | 'razorpay';
  label: string;
  secretsInFrontend: false;
}
