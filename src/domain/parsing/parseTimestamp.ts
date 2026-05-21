export function parseTimestamp(ts: string): Date | null {
  if (!ts || ts.includes('--')) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(ts)) {
      return new Date(ts.replace(',', '.'));
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(ts)) {
      return new Date(ts);
    }
    if (/^\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2}/.test(ts)) {
      const parts = ts.match(/(\d{2})-(\d{2})-(\d{4})\s(.*)/);
      if (parts) return new Date(`${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}`);
    }
    return new Date(ts);
  } catch {
    return null;
  }
}
