export function highlightHtmlText(html: string, search: string, isRegex: boolean): string {
  if (!search) return html;
  let regex: RegExp;
  try {
    if (isRegex) {
      regex = new RegExp(`(${search})`, 'gi');
    } else {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(${escaped})`, 'gi');
    }
  } catch {
    return html;
  }

  // Split HTML string by tag elements: <span ...> or </span>
  const parts = html.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) {
      // Highlight search term inside pure text blocks, wrapping them in .highlight-nested marks
      parts[i] = parts[i].replace(regex, '<mark class="highlight-nested">$1</mark>');
    }
  }
  return parts.join('');
}
