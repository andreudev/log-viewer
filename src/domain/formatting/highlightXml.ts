function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripArtifacts(text: string): string {
  return text
    .replace(/\s*class="xml-[^"]+"\s*/g, '')
    .replace(/\s*class='xml-[^']+'\s*/g, '')
    .replace(/\s*class=\\"xml-[^\\"]+\\"\s*/g, '')
    .replace(/\s*class=&quot;xml-[^&]+&quot;\s*/g, '')
    .replace(/<span[^>]*class=["']xml-[^"']+["'][^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .trim();
}

export function highlightXml(xml: string): string {
  const cleanXml = stripArtifacts(xml);
  let highlighted = escapeHtml(cleanXml)
    .replace(/(&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;)/g, '<span data-xml-cdata>$1</span>')
    .replace(/(&lt;\/?)([a-zA-Z0-9_\-:]+)(\s|&gt;)/g, '$1<span data-xml-tag>$2</span>$3')
    .replace(/(\s[a-zA-Z0-9_\-:]+=)\"([^\"]*)\"/g, ' <span data-xml-attr-name>$1</span><span data-xml-attr-val>"$2"</span>')
    .replace(/(\s[a-zA-Z0-9_\-:]+=)\'([^\']*)\'/g, ' <span data-xml-attr-name>$1</span><span data-xml-attr-val>\'$2\'</span>');

  highlighted = highlighted.replace(/\s*class=\\"xml-[^\\"]+\\"\s*/g, '');
  highlighted = highlighted.replace(/\s*class=&quot;xml-[^&]+&quot;\s*/g, '');
  highlighted = highlighted.replace(/\s*class="xml-[^"]+"\s*/g, '');
  return highlighted;
}
