import { simpleParser } from "mailparser";

export const MAX_INBOUND_SOURCE_BYTES = 1024 * 1024;
export const MAX_INBOUND_TEXT_CHARS = 20_000;
export const MAX_INBOUND_HTML_CHARS = 50_000;
export const MAX_REPLY_CLASSIFICATION_CHARS = 12_000;

export type ParsedInboundMime = {
  bodyText: string;
  bodyHtml?: string;
  referencesHeader?: string;
  classificationText: string;
};

export async function parseInboundMime(source: Buffer): Promise<ParsedInboundMime> {
  if (source.byteLength > MAX_INBOUND_SOURCE_BYTES) {
    throw new Error(`Inbound email exceeds ${MAX_INBOUND_SOURCE_BYTES} bytes`);
  }

  const parsed = await simpleParser(source, {
    skipHtmlToText: false,
    skipTextToHtml: true,
    keepCidLinks: true
  });
  const bodyText = truncate(normalizeLineEndings(parsed.text ?? ""), MAX_INBOUND_TEXT_CHARS);
  const bodyHtml = typeof parsed.html === "string"
    ? truncate(parsed.html, MAX_INBOUND_HTML_CHARS)
    : undefined;
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];

  return {
    bodyText,
    bodyHtml,
    referencesHeader: references.length ? references.join(" ") : undefined,
    classificationText: extractLatestReply(bodyText)
  };
}

export function extractLatestReply(bodyText: string): string {
  const normalized = normalizeLineEndings(bodyText);
  const lines = normalized.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (isQuotedReplyBoundary(trimmed) || trimmed === "--") break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }

  return truncate(kept.join("\n").trim(), MAX_REPLY_CLASSIFICATION_CHARS);
}

function isQuotedReplyBoundary(line: string) {
  return /^On .+wrote:$/i.test(line)
    || /^From:\s.+$/i.test(line)
    || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line)
    || /^_{5,}$/.test(line);
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function truncate(value: string, maxChars: number) {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}
