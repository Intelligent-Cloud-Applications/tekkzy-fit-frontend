import type { NotificationChannel } from '@shared/types';

export interface NotificationPayload {
  to: string;
  title: string;
  message: string;
  channel: NotificationChannel;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<{ delivered: boolean; detail: string }>;
}
