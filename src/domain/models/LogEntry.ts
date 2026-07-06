export type LogLevel = string;

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  thread: string;
  className: string;
  service: string;
  correlationId: string;
  message: string;
  raw: string;
  deltaTimeMs?: number;
  originFile?: string;
  customBadge?: string;
  annotation?: string;
  /**
   * Numeric endpoint code (e.g. "1015") extracted from logs that include
   * `[ Endpoint: 1015 ]`. Used for fast filtering and traceability.
   */
  endpoint?: string;
}

