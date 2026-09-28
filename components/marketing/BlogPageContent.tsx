"use client";

import {
  StaticCard,
  StaticMarketingPage,
  StaticProseSection,
} from "@/components/marketing/StaticMarketingPage";

const BLOG_POSTS = [
  {
    title: "Why we separate briefings from chat research",
    description:
      "Broad discovery and targeted Q&A need different pipelines, budgets, and persistence models. Here’s how Newsly splits the two.",
    meta: "Product · 6 min read",
  },
  {
    title: "Sources first: how stories stay tied to evidence",
    description:
      "Synthesis is only useful if you can audit it. A short tour of NewsSource, ResearchSource, and what gets embedded for reuse.",
    meta: "Engineering · 8 min read",
  },
  {
    title: "Designing for local and world scope in one request",
    description:
      "Search planning, Serp tiers, and date filters when you want Hyderabad and global markets in the same briefing.",
    meta: "Research · 5 min read",
  },
] as const;

export function BlogPageContent() {
  return (
    <StaticMarketingPage
      eyebrow="Blog"
      title="Notes from the Newsly team"
      lead="Product updates, research workflow ideas, and behind-the-scenes architecture—static previews for now; full posts coming soon."
    >
      <div className="grid gap-4 sm:grid-cols-1">
        {BLOG_POSTS.map((post) => (
          <StaticCard key={post.title} {...post} />
        ))}
      </div>
      <StaticProseSection>
        <p>
          Want updates when we publish?{" "}
          <a href="mailto:hello@newsly.app">Say hello</a> and we&apos;ll add you
          to occasional release notes.
        </p>
      </StaticProseSection>
    </StaticMarketingPage>
  );
}
