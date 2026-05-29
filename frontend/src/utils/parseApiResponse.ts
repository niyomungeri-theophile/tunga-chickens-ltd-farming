export async function parseApiResponse(res: Response): Promise<any> {
  const text = await res.text();

  if (!text) return {};

  const cleanText = text.replace(/^\uFEFF/, '');

  try {
    return JSON.parse(cleanText);
  } catch {
    const firstJsonChar = cleanText.search(/[\[{]/);
    if (firstJsonChar > 0) {
      const candidate = cleanText.slice(firstJsonChar);
      try {
        return JSON.parse(candidate);
      } catch {
        // fallthrough
      }
    }

    const contentType = res.headers.get('content-type') || 'unknown';
    const normalized = cleanText.replace(/\s+/g, ' ').trim();
    const printableSnippet = normalized.replace(/[^\x20-\x7E]/g, '').slice(0, 120);

    if (!printableSnippet) {
      throw new Error(`Unreadable server response (${res.status}, ${contentType}).`);
    }

    throw new Error(`Server returned non-JSON response (${res.status}, ${contentType}): ${printableSnippet}`);
  }
}

export default parseApiResponse;
