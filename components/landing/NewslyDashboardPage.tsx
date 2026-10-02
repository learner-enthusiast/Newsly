import { TrendingSection } from "@/components/landing/TrendingSection";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/** Signed-in home: the product, not the public story. */
export function NewslyDashboardPage() {
  return (
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
      <section className="landing-section pt-16 pb-4 sm:pt-20">
        <p className="text-[0.75rem] font-medium tracking-[0.2em] text-[#c85d3f] uppercase">
          Your desk
        </p>
        <h1 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
          Pick up a story, or ask a question.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="brand" nativeButton={false} render={<Link href="/news" />}>
            Browse news
          </Button>
          <Button variant="outline" size="lg" className="rounded-full" nativeButton={false} render={<Link href="/chat" />}>
            Open chat
          </Button>
          <Button variant="sketch-outline" nativeButton={false} render={<Link href="/pricing" />}>
            Plans & Pro
          </Button>
        </div>
      </section>
      <TrendingSection />
    </main>
  );
}
