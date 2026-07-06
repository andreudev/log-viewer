export function beautifyXml(xml: string): string {
  let cleanXml = xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  let formatted = '';
  const reg = /(>)(<)(\/*)/g;
  cleanXml = cleanXml.replace(reg, '$1\r\n$2$3');
  let pad = 0;

  cleanXml.split('\r\n').forEach(line => {
    let indent = 0;
    if (line.match(/.+<\/\w[^>]*>$/)) {
      indent = 0;
    } else if (line.match(/^<\/\w/)) {
      if (pad !== 0) pad -= 1;
    } else if (line.match(/^<\w([^>]*[^\/])?>.*$/)) {
      indent = 1;
    } else {
      indent = 0;
    }

    formatted += '  '.repeat(pad) + line + '\r\n';
    pad += indent;
  });

  return formatted.trim();
}
