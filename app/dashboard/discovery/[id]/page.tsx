import { DiscoveryResultsView } from "@/components/discovery/discovery-results-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DiscoveryResultsPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="landing-section flex flex-1 flex-col py-10 md:py-14">
      <DiscoveryResultsView discoveryRunId={id} />
    </main>
  );
}
