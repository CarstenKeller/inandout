export function hashFileContent(content: string): string {
  const sample = content.slice(0, 3000) + '|' + content.slice(-1000) + '|' + content.length;
  let h = 5381;
  for (let i = 0; i < sample.length; i++) {
    h = ((h << 5) + h) ^ sample.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}
