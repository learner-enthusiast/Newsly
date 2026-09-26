"use client";

import { TOPIC_OPTIONS } from "@/components/news/newsPageConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpButton } from "@clerk/nextjs";
import {
  BarChart3,
  Bookmark,
  Check,
  Globe2,
  ArrowRight,
  Play,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    title: "Personalized news",
    description:
      "Choose date, scope, location, and topics — we tailor each briefing to what you care about.",
    icon: Target,
  },
  {
    title: "Local & global",
    description:
      "Cover your city, your country, or world markets in one run — or combine local and global.",
    icon: Globe2,
  },
  {
    title: "AI-powered",
    description:
      "Search, article selection, and synthesis use AI to surface distinct, source-backed stories.",
    icon: Zap,
  },
  {
    title: "Trusted sources",
    description:
      "Stories are built from scraped articles with citations — optional domain filters for publishers you trust.",
    icon: Shield,
  },
  {
    title: "Save & organize",
    description:
      "Recent requests stay in your history; open any briefing again without regenerating.",
    icon: Bookmark,
  },
  {
    title: "Stay ahead",
    description:
      "Ranked by importance with summaries and deep dives when you want more context.",
    icon: BarChart3,
  },
] as const;

const STEPS = [
  {
    step: 1,
    title: "Set your preferences",
    description: "Pick date, scope, location, categories, and how many stories you need.",
    icon: Settings2,
  },
  {
    step: 2,
    title: "We find the news",
    description: "Newsly searches trusted sources and gathers candidate articles for your request.",
    icon: Search,
  },
  {
    step: 3,
    title: "We analyze & summarize",
    description: "Articles are verified, cleaned, and clustered into clear, readable briefings.",
    icon: Sparkles,
  },
  {
    step: 4,
    title: "Get your news briefing",
    description: "Review ranked stories with sources, vote, and deep dive into any topic.",
    icon: Star,
  },
] as const;

function GetStartedButton({ className }: { className?: string }) {
  return (
    <SignUpButton mode="modal">
      <Button variant="brand" className={className}>
        Get Started Free
        <ArrowRight data-icon="inline-end" />
      </Button>
    </SignUpButton>
  );
}

export function NewslyLandingPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <section className="landing-section grid gap-10 pb-16 pt-10 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pt-16">
        <div className="flex flex-col gap-6">
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1">
            <Sparkles />
            Your personal news intelligence
          </Badge>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Stay informed with news that actually matters
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Newsly curates market and economic news from trusted sources — localized
            or global — then delivers concise, source-backed briefings you can
            trust.
          </p>
          <div className="flex flex-wrap gap-3">
            <GetStartedButton />
            <Button variant="outline" size="lg" render={<Link href="#how-it-works" />}>
              <Play data-icon="inline-start" />
              Watch demo
            </Button>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
            {[
              "Curated from trusted sources",
              "Local & global coverage",
              "Save and organize your news",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="rounded-2xl border border-border/50 bg-card/80 p-6 shadow-paper">
            <div className="flex flex-col gap-3">
              <Card size="sm" className="shadow-xs">
                <CardHeader className="pb-2">
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    Infrastructure
                  </Badge>
                  <CardTitle className="text-sm leading-snug">
                    Metro expansion gets green light
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Hyderabad · 2h ago
                </CardContent>
              </Card>
              <Card size="sm" className="ml-6 shadow-xs">
                <CardHeader className="pb-2">
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    Markets
                  </Badge>
                  <CardTitle className="text-sm leading-snug">
                    RBI bulletin highlights resilient growth
                  </CardTitle>
                </CardHeader>
              </Card>
              <p className="rounded-lg bg-accent/30 px-3 py-2 text-center text-xs font-medium">
                Summarized, relevant, and easy to read
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["Business", "Technology", "Real estate", "Markets"].map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border/30 bg-muted/20 py-16">
        <div className="landing-section flex flex-col gap-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">Features</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              Everything you need for smarter news
            </h2>
            <p className="mt-2 text-muted-foreground">
              From search to synthesis — one workflow for daily briefings.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, description, icon: Icon }) => (
              <Card key={title} size="sm" className="h-full bg-card/90">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/35">
                    <Icon />
                  </span>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16">
        <div className="landing-section flex flex-col gap-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">How it works</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              From preferences to briefing in minutes
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ step, title, description, icon: Icon }) => (
              <div key={step} className="flex flex-col gap-3 text-center sm:text-left">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground sm:mx-0">
                  {step}
                </span>
                <Icon className="mx-auto size-6 text-muted-foreground sm:mx-0" />
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="topics" className="border-t border-border/30 bg-muted/15 py-16">
        <div className="landing-section flex flex-col gap-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">Topics</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              Cover the themes that matter to you
            </h2>
            <p className="mt-2 text-muted-foreground">
              Mix categories or focus on one — business, policy, markets, and more.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {TOPIC_OPTIONS.map(({ label, icon: Icon }) => (
              <Badge key={label} variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
                <Icon />
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16">
        <div className="landing-section">
          <Card className="overflow-hidden border-border/60 bg-linear-to-b from-card to-muted/30">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <h2 className="font-display max-w-lg text-2xl font-semibold sm:text-3xl">
                Be the first to experience a smarter way to read news
              </h2>
              <p className="text-sm text-muted-foreground">
                Free to get started. No credit card required.
              </p>
              <GetStartedButton className="mt-2" />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
