export function formatLooseJson(jsonStr: string): string {
  let output = '';
  let indent = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '{' || char === '[') {
      indent += 1;
      output += `${char}\n${'  '.repeat(indent)}`;
      continue;
    }

    if (char === '}' || char === ']') {
      indent = Math.max(0, indent - 1);
      output += `\n${'  '.repeat(indent)}${char}`;
      continue;
    }

    if (char === ',') {
      output += `,\n${'  '.repeat(indent)}`;
      continue;
    }

    if (char === ':') {
      output += ': ';
      continue;
    }

    output += char;
  }

  return output.trim();
}
