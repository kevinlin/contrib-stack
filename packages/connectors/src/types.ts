export type ConnectorCreds = { token: string; baseUrl?: string };
export type AccountInfo = { username: string; accountCreatedAt: string };
export type DayCount = { date: string; count: number };

export class ConnectorAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorAuthError";
  }
}

export interface Connector {
  validate(creds: ConnectorCreds): Promise<AccountInfo>;
  backfill(
    creds: ConnectorCreds,
    since: string,
    until: string,
  ): AsyncIterable<DayCount[]>;
  refresh(creds: ConnectorCreds, days: number): Promise<DayCount[]>;
}
