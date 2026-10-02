import { mockNotificationProvider } from './MockNotificationProvider';
import type { NotificationProvider } from './types';

export type { NotificationProvider, NotificationPayload } from './types';
export { MockNotificationProvider, mockNotificationProvider } from './MockNotificationProvider';

export function getNotificationProvider(): NotificationProvider {
  return mockNotificationProvider;
}
