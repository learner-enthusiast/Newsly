import { DiscoveryForm } from "@/components/discovery/discovery-form";

export default function DashboardPage() {
  return (
    <main className="landing-section flex flex-1 flex-col gap-8 py-10 md:py-14">
      <header className="max-w-2xl space-y-2">
        <h1 className="text-display text-3xl text-foreground md:text-4xl">
          News Intelligence
        </h1>
        <p className="text-base text-muted-foreground md:text-lg">
          Discover important financial, business and market events.
        </p>
      </header>
      <div className="max-w-xl">
        <DiscoveryForm />
      </div>
    </main>
  );
}
