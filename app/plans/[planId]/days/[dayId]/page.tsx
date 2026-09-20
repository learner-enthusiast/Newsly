import { DayEditor } from "./day-editor";

type DayPageProps = {
  params: Promise<{ planId: string; dayId: string }>;
};

export default async function PlanDayPage({ params }: DayPageProps) {
  const { planId, dayId } = await params;

  return (
    <main className="landing-section flex w-full flex-1 flex-col py-8 md:py-10">
      <DayEditor planId={planId} dayId={dayId} />
    </main>
  );
}
