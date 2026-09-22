import { StoryDetailView } from "@/components/discovery/story-detail-view";

type PageProps = {
  params: Promise<{ id: string; eventId: string }>;
};

export default async function StoryDetailPage({ params }: PageProps) {
  const { id, eventId } = await params;

  return (
    <main className="landing-section flex flex-1 flex-col py-10 md:py-14">
      <StoryDetailView discoveryRunId={id} eventId={eventId} />
    </main>
  );
}
