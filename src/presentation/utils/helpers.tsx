import React from 'react';

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function toLocalISOString(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const tzoffset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
}

export function highlightText(text: string, search: string, isRegex: boolean): React.ReactNode {
  if (!search) return text;
  try {
    let regex: RegExp;
    if (isRegex) {
      regex = new RegExp(`(${search})`, 'gi');
    } else {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(${escaped})`, 'gi');
    }
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? <mark key={i} className="search-match">{part}</mark> : part
        )}
      </>
    );
  } catch {
    return text;
  }
}

export function getFileColorStyle(fileName: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < fileName.length; i++) {
    hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    color: `hsl(${hue}, 45%, 65%)`,
    borderColor: `hsla(${hue}, 45%, 65%, 0.35)`,
    backgroundColor: `hsla(${hue}, 45%, 65%, 0.08)`
  };
}
