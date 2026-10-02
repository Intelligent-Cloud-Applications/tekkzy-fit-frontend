import { apiRequest } from '@/services/api';

/**
 * Cloud database abstraction.
 *
 * The frontend never talks to AWS (RDS, DynamoDB, S3) directly.
 * A future AWS-backed API implements this interface on the server.
 * The browser only calls the local/cloud HTTP API through ApiClient.
 */
export interface CloudDatabase {
  push(payload: { entity: string; entityId: string; operation: string; data: unknown }): Promise<void>;
  pull(since?: string): Promise<{ entity: string; records: unknown[] }[]>;
}

export class HttpCloudDatabase implements CloudDatabase {
  constructor(_baseUrl?: string) {}

  async push(payload: {
    entity: string;
    entityId: string;
    operation: string;
    data: unknown;
  }): Promise<void> {
    await apiRequest('/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async pull(since?: string): Promise<{ entity: string; records: unknown[] }[]> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiRequest(`/sync/pull${query}`);
  }
}
