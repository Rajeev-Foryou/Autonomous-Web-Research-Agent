export function chunkText(text: string, size = 3000): string[] {
  const normalizedText = text ?? "";
  const chunkSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 3000;

  if (!normalizedText.length) {
    return [];
  }

  const chunks: string[] = [];

  for (let start = 0; start < normalizedText.length; start += chunkSize) {
    chunks.push(normalizedText.slice(start, start + chunkSize));
  }

  return chunks;
}