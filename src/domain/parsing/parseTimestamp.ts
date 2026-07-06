export function parseTimestamp(ts: string): Date | null {
  if (!ts || ts.includes('--')) return null;
  try {
    let d: Date;
    
    // Format A: "2026-03-11 16:50:08,501" or "2026-3-11 16:50:08,501"
    if (/^\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{2}:\d{2}/.test(ts)) {
      d = new Date(ts.replace(',', '.'));
    }
    // Format B: "3/10/2026 4:05:24 PM" or "03/10/2026 16:05:24"
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(ts)) {
      d = new Date(ts);
    }
    // Format C: "04-12-2025 08:21:00" or "4-12-2025 8:21:00"
    else if (/^\d{1,2}-\d{1,2}-\d{4}\s\d{1,2}:\d{2}:\d{2}/.test(ts)) {
      const parts = ts.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s(.*)/);
      if (parts) {
        // Construct standard ISO format: YYYY-MM-DDTHH:mm:ss
        const day = parts[1].padStart(2, '0');
        const month = parts[2].padStart(2, '0');
        const year = parts[3];
        const time = parts[4];
        d = new Date(`${year}-${month}-${day}T${time}`);
      } else {
        d = new Date(ts);
      }
    } else {
      d = new Date(ts);
    }

    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
