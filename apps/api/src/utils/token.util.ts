import { decode, encode } from "gpt-tokenizer";

export function truncateToTokenLimit(input: string, maxTokens: number): string {
  if (!input) {
    return "";
  }

  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return "";
  }

  const tokens = encode(input);

  if (tokens.length <= maxTokens) {
    return input;
  }

  return decode(tokens.slice(0, maxTokens));
}

export function tokenCount(input: string): number {
  if (!input) {
    return 0;
  }

  return encode(input).length;
}
