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
}

