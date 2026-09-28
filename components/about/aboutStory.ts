/**
 * Content and geometry for /about. Every diagram reads from here so the
 * architecture is defined once. Positions are deterministic: no randomness.
 */

export const ACCENT = "#c85d3f";

export type Stage = { id: string; label: string; detail: string };

/** inngest/newsPipeline.ts — `news/pipeline.requested` */
export const NEWS_PIPELINE: readonly Stage[] = [
  { id: "discover", label: "Discover", detail: "A news request: date, place, scope, topics." },
  { id: "search", label: "Search", detail: "Planned queries across Google News, web news, and YouTube." },
  { id: "collect", label: "Collect", detail: "Normalized hits, plus AI Overview follow-up searches." },
  { id: "select", label: "Select", detail: "An article selector picks what is worth reading." },
  { id: "scrape", label: "Scrape", detail: "Firecrawl turns chosen URLs into article text." },
  { id: "clean", label: "Clean", detail: "A cleaner strips navigation, ads, and junk pages." },
  { id: "synthesize", label: "Synthesize", detail: "Stories are written only from that evidence." },
  { id: "story", label: "Story", detail: "NewsStory and NewsSource rows, then a notification." },
];

/** inngest/chatPipeline.ts — `chat/message.research.requested` */
export const CHAT_PIPELINE: readonly Stage[] = [
  { id: "question", label: "Question", detail: "A message in a research session." },
  { id: "understand", label: "Understand", detail: "Guardrails, a query enhancer, then a determiner." },
  { id: "memory", label: "Check memory", detail: "Similar session research, if embeddings exist." },
  { id: "search", label: "Search if needed", detail: "Serp and YouTube only when the determiner asks." },
  { id: "evidence", label: "Collect evidence", detail: "Firecrawl, cleaning, saved ResearchSource rows." },
  { id: "answer", label: "Answer", detail: "A reply grounded in that evidence." },
];

/** inngest/chatstoryPipeline.ts — `chat/story.research.requested` */
export const STORY_FROM_CHAT: readonly Stage[] = [
  { id: "question", label: "Question", detail: "Asked in a general chat." },
  { id: "research", label: "Chat research", detail: "The message pipeline gathers evidence." },
  { id: "create", label: "Create story", detail: "The determiner decides a story is wanted." },
  { id: "process", label: "Story pipeline", detail: "Reuses that evidence; searches more only for gaps." },
  { id: "evidence", label: "Evidence", detail: "NewsSource rows saved beside the prose." },
  { id: "draft", label: "Draft story", detail: "Private until the owner publishes." },
];

export type ArchNode = { id: string; label: string; sub?: string; x: number; y: number };
export type ArchEdge = { from: string; to: string };

/** Desktop architecture diagram, viewBox 0 0 960 520. */
export const ARCH_NODES: readonly ArchNode[] = [
  { id: "reader", label: "Reader", sub: "browser", x: 480, y: 40 },
  { id: "next", label: "Next.js", sub: "pages · route handlers · Clerk auth", x: 480, y: 130 },
  { id: "inngest", label: "Inngest", sub: "durable jobs", x: 480, y: 220 },
  { id: "news", label: "News pipeline", sub: "news/pipeline.requested", x: 200, y: 310 },
  { id: "chat", label: "Chat pipeline", sub: "chat/pipeline.requested · chat/message.research.requested", x: 480, y: 310 },
  { id: "story", label: "Chat story pipeline", sub: "chat/story.research.requested", x: 760, y: 310 },
  { id: "research", label: "SerpAPI · Firecrawl · YouTube · OpenAI agents", x: 480, y: 400 },
  { id: "db", label: "PostgreSQL + pgvector", sub: "NewsStory · NewsSource · ResearchSource · ChatMessage", x: 480, y: 490 },
];

export const ARCH_EDGES: readonly ArchEdge[] = [
  { from: "reader", to: "next" },
  { from: "next", to: "inngest" },
  { from: "inngest", to: "news" },
  { from: "inngest", to: "chat" },
  { from: "inngest", to: "story" },
  { from: "news", to: "research" },
  { from: "chat", to: "research" },
  { from: "story", to: "research" },
  { from: "research", to: "db" },
];

/** Mobile architecture, top to bottom. */
export const ARCH_MOBILE = [
  "Reader",
  "Next.js + Clerk",
  "Inngest",
  "News · Chat · Chat story pipelines",
  "SerpAPI · Firecrawl · YouTube · OpenAI",
  "PostgreSQL + pgvector",
] as const;

export type GraphNode = { id: string; label: string; x: number; y: number; tier: "document" | "source" | "story" };

/** Evidence graph, viewBox 0 0 760 440. Story rests on stored sources. */
export const EVIDENCE_NODES: readonly GraphNode[] = [
  { id: "d1", label: "Article text", x: 200, y: 60, tier: "document" },
  { id: "d2", label: "Article text", x: 390, y: 60, tier: "document" },
  { id: "d3", label: "YouTube transcript", x: 580, y: 60, tier: "document" },
  { id: "d4", label: "Session research", x: 690, y: 140, tier: "document" },
  { id: "s1", label: "NewsSource", x: 280, y: 215, tier: "source" },
  { id: "s2", label: "NewsSource", x: 480, y: 215, tier: "source" },
  { id: "s3", label: "ResearchSource", x: 650, y: 260, tier: "source" },
  { id: "story", label: "Story", x: 430, y: 380, tier: "story" },
];

export const EVIDENCE_EDGES: readonly ArchEdge[] = [
  { from: "d1", to: "s1" },
  { from: "d2", to: "s1" },
  { from: "d2", to: "s2" },
  { from: "d3", to: "s2" },
  { from: "d4", to: "s3" },
  { from: "s1", to: "story" },
  { from: "s2", to: "story" },
  { from: "s3", to: "story" },
];

export type VectorPoint = { id: string; x: number; y: number; r: number; related?: boolean; query?: boolean };

/** Research memory, viewBox 0 0 640 320. */
export const VECTOR_POINTS: readonly VectorPoint[] = [
  { id: "p01", x: 70, y: 84, r: 3 },
  { id: "p02", x: 132, y: 212, r: 3.5 },
  { id: "p03", x: 178, y: 70, r: 3 },
  { id: "p04", x: 236, y: 250, r: 3 },
  { id: "p05", x: 214, y: 150, r: 3.5 },
  { id: "p06", x: 302, y: 60, r: 3 },
  { id: "p07", x: 368, y: 120, r: 4.5, related: true },
  { id: "p08", x: 428, y: 92, r: 4, related: true },
  { id: "p09", x: 452, y: 176, r: 4.5, related: true },
  { id: "p10", x: 386, y: 196, r: 4, related: true },
  { id: "query", x: 410, y: 146, r: 7, query: true },
  { id: "p11", x: 530, y: 62, r: 3 },
  { id: "p12", x: 566, y: 232, r: 3.5 },
  { id: "p13", x: 84, y: 272, r: 3 },
  { id: "p14", x: 604, y: 140, r: 3 },
  { id: "p15", x: 318, y: 270, r: 3 },
];

export const ENGINEERING_LAYERS = [
  { layer: "Application", names: ["Next.js", "TypeScript", "React"] },
  { layer: "Orchestration", names: ["Inngest"] },
  { layer: "Research", names: ["SerpAPI", "Firecrawl", "OpenAI"] },
  { layer: "Storage", names: ["PostgreSQL", "Prisma", "pgvector"] },
  { layer: "Identity", names: ["Clerk"] },
] as const;

export const LIFECYCLE = [
  "Raw web",
  "Search results",
  "Scraped pages",
  "Cleaned text",
  "Stored sources",
  "Synthesis",
  "Story or answer",
] as const;

export const NOISE_STEPS = ["Search", "Select", "Deduplicate", "Extract", "Evidence", "Synthesize"] as const;

/** Deterministic pseudo-random in [0, 1). Same input, same output, no Math.random. */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Deterministic scatter for the "internet" cloud, viewBox coords. */
export function noiseCloud(count: number): readonly { x: number; y: number; r: number }[] {
  const points: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = hash01(i + 1);
    const v = hash01(i * 7 + 3);
    const w = hash01(i * 13 + 5);
    // Denser toward the middle-left, thinning to the right edge of the cloud.
    const x = 36 + u * u * 220;
    const y = 50 + v * 300;
    points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: 1.4 + w * 1.6 });
  }
  return points;
}

export const PROBLEM_WORDS = [
  { label: "Headlines", x: 80, y: 70 },
  { label: "Videos", x: 700, y: 58 },
  { label: "Threads", x: 760, y: 300 },
  { label: "Articles", x: 400, y: 40 },
  { label: "Sources", x: 60, y: 250 },
  { label: "Documents", x: 660, y: 160 },
  { label: "Claims", x: 230, y: 340 },
] as const;
