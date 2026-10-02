/**
 * Production PostgreSQL adapter.
 *
 * The local gym can run without this. Set DATABASE_PROVIDER=postgres and
 * DATABASE_URL when a server is available. Do not put credentials in the frontend.
 *
 * Suggested tables: users, members, membership_plans, memberships, attendance,
 * payments, devices, access_events, notifications, sync_queue, gym_settings.
 */
export class PostgresDatabaseProvider {
  constructor(private readonly connectionString: string) {}

  async ping(): Promise<never> {
    throw new Error(
      `PostgreSQL provider is not connected. Supply DATABASE_URL (received host pattern: ${this.redacted()}) and implement pg queries here.`,
    );
  }

  private redacted(): string {
    try {
      const url = new URL(this.connectionString);
      return `${url.hostname}:${url.port || '5432'}`;
    } catch {
      return 'invalid-url';
    }
  }
}
