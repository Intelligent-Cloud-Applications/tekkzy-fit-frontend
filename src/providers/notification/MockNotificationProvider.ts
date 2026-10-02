import type { NotificationPayload, NotificationProvider } from './types';

export class MockNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<{ delivered: boolean; detail: string }> {
    return {
      delivered: true,
      detail: `Queued on mock ${payload.channel} channel for ${payload.to}. WhatsApp / SMS / Email are not connected.`,
    };
  }
}

export const mockNotificationProvider = new MockNotificationProvider();
