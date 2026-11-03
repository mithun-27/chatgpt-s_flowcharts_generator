export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to locate a JSON object inside surrounding prose.
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Try repairing trailing commas, a common LLM mistake.
      try {
        return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
      } catch {
        throw new Error('The AI response was not valid JSON. Try again or use the simple parser.');
      }
    }
  }

  throw new Error('The AI response did not contain a JSON diagram.');
}

export function shortError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
