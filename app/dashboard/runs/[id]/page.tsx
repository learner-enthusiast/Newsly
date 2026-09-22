import Link from "next/link";
import { DiscoveryRunStatus } from "@/components/discovery/discovery-run-status";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DiscoveryRunPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="landing-section flex flex-1 flex-col gap-6 py-10 md:py-14">
      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          ← Dashboard
        </Button>
      </div>
      <div className="max-w-2xl">
        <DiscoveryRunStatus runId={id} />
      </div>
    </main>
  );
}
