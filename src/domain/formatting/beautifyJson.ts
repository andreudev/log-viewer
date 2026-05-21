export function beautifyJson(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, 2);
  } catch {
    try {
      const fixedStr = jsonStr.replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '');
      const parsed = JSON.parse(fixedStr);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonStr;
    }
  }
}
