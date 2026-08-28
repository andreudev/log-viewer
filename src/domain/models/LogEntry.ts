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
  /**
   * Java/Spring stacktrace extracted from the `exception` field of JSON
   * logs (logs at ERROR/SEVERE level often include it). Rendered in
   * the bottom detail panel in a separate collapsible section so the
   * huge stack doesn't overwhelm the regular message.
   */
  exception?: string;
  /**
   * Stable identity for pins/annotations across cache reloads.
   *
   * `id` is a *display index* that gets reassigned every time the merged
   * timeline is re-sorted (`finalLogs.forEach((item, idx) => item.id = idx + 1)`),
   * so it changes on every reload. `originalId` is set by the parser once
   * (during the initial parse in the worker) and MUST NOT be reassigned.
   *
   * Pin/annotation keys are `${originFile}::${originalId ?? id}`. If this
   * field is missing on a cached entry, the cache loader must fall back to
   * the cached `id` (treated as a permanent id) — never to a re-indexed one.
   */
  originalId?: number;
}

