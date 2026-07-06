import { LogEntry } from '../models/LogEntry';
import { parseTimestamp } from './parseTimestamp';

export function calculateDeltas(entries: LogEntry[]): LogEntry[] {
  const parsedDates = new Map<number, number>();
  entries.forEach(e => {
    const d = parseTimestamp(e.timestamp);
    if (d) {
      parsedDates.set(e.id, d.getTime());
    }
  });

  const groups = new Map<string, LogEntry[]>();
  entries.forEach(entry => {
    const cid = entry.correlationId;
    if (cid && cid !== '-') {
      if (!groups.has(cid)) {
        groups.set(cid, []);
      }
      groups.get(cid)!.push(entry);
    }
  });

  groups.forEach((groupEntries) => {
    groupEntries.sort((a, b) => {
      const timeA = parsedDates.get(a.id) || 0;
      const timeB = parsedDates.get(b.id) || 0;
      return timeA - timeB;
    });

    for (let i = 1; i < groupEntries.length; i++) {
      const prev = groupEntries[i - 1];
      const curr = groupEntries[i];
      const prevTime = parsedDates.get(prev.id);
      const currTime = parsedDates.get(curr.id);
      if (prevTime !== undefined && currTime !== undefined) {
        curr.deltaTimeMs = currTime - prevTime;
      }
    }
  });

  return entries;
}
