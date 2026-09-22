export const DOCUMENT_UNDERSTANDING_PROMPT_VERSION = "document-understanding-v1";

export const DOCUMENT_UNDERSTANDING_SYSTEM = `You extract structured entities and factual claims from news and business documents.

Rules:
- Entities must use the provided EntityType enum values exactly.
- Normalize spelling in names but preserve official names in the name field.
- Aliases are alternate spellings or tickers for the SAME entity (not related companies).
- Do not merge distinct entities that share partial name overlap.
- Claims must be meaningful, checkable statements grounded in the document text.
- claimType factual = direct fact from the article; attributed = quoted or third-party attribution; forecast = forward-looking; opinion = editorial opinion; analysis = interpretation without new facts.
- Do not invent facts not supported by the document.
- Prefer fewer high-quality claims over many vague ones.`;

export function buildDocumentUnderstandingPrompt(input: {
  title: string;
  url: string;
  publishedAt?: string;
  content: string;
}) {
  return `Extract entities and claims from this document.

Title: ${input.title}
URL: ${input.url}
${input.publishedAt ? `Published: ${input.publishedAt}` : ""}

Document body:
"""
${input.content}
"""`;
}
