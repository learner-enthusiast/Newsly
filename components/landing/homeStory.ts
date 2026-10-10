/** Homepage storytelling copy. Illustrations are labeled in the UI and are not live news. */

export const ACCENT = "#c85d3f";

export const HEADLINE_LAYERS = [
  { kicker: "What happened", body: "A duty change was announced." },
  {
    kicker: "What led to it",
    body: "Domestic makers had asked for protection. Earlier rules favored assembly over full local production.",
  },
  {
    kicker: "Who is affected",
    body: "Importers, factories building here, and buyers waiting on a price.",
  },
  {
    kicker: "What the sources say",
    body: "One report cites the notice. Another quotes industry groups. A third notes what was left unchanged.",
  },
  { kicker: "What changed", body: "The rate, and which vehicle classes it covers." },
  {
    kicker: "Why it matters",
    body: "Imported electric cars get more expensive relative to ones built in India.",
  },
] as const;

export const RESEARCH_POINTS = [
  "What was announced",
  "The original notice",
  "How other reports described it",
  "What actually changed",
  "Research this session already has",
  "What is still unclear",
] as const;

export const RESEARCH_STAGES = [
  { label: "Discover", detail: "Search the open web, news, and video for the question." },
  { label: "Select", detail: "Keep the pages worth reading. Leave the rest." },
  { label: "Read", detail: "Pull the article itself, not just the snippet." },
  {
    label: "Connect",
    detail: "Reuse research this session already has. Look up only what is missing.",
  },
  { label: "Understand", detail: "Write an answer, or a story, from that evidence." },
] as const;

export const CHAT_TURNS = [
  {
    role: "user" as const,
    text: "What's actually driving India's EV growth?",
  },
  {
    role: "assistant" as const,
    text: "Cheaper models, charging buildout, and state incentives show up across recent reports. Two of those were already in this session. One new filing was read for the policy detail.",
  },
  { role: "user" as const, text: "Go deeper into government policy." },
  {
    role: "assistant" as const,
    text: "The latest notice changes how some imports are treated. Here is what it says, and where the coverage disagrees.",
  },
  { role: "user" as const, text: "What changed in the last year?" },
  {
    role: "assistant" as const,
    text: "Compared with last year's scheme, the support window narrowed. The import rule is the new piece.",
  },
];

/** Example questions inside the product's finance and economics scope. Not advice. */
export const ASK_PROMPTS = [
  "Why are Indian EV exports rising?",
  "What changed in India's semiconductor policy?",
  "What are markets saying about the latest rate decision?",
  "What's actually happening with AI regulation?",
] as const;

export const STORY_TRAIL = ["The notice", "A market report", "An industry response", "A video briefing"] as const;

export const BROWSE_PATH = [
  { label: "Browse", detail: "A briefing for a place and a day." },
  { label: "Notice", detail: "One story is worth more than its headline." },
  { label: "Ask", detail: "Open it and ask what you still don't know." },
  { label: "Research", detail: "New pages are read. Earlier research is reused." },
  { label: "Go deeper", detail: "Follow-up questions stay in the same session." },
  { label: "Keep it", detail: "Ask for a story. It stays yours until you publish." },
] as const;
