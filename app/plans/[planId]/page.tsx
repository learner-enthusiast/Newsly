import { PlanView } from "./plan-view";

type PlanPageProps = {
  params: Promise<{ planId: string }>;
};

export default async function PlanPage({ params }: PlanPageProps) {
  const { planId } = await params;

  return (
    <main className="landing-section flex w-full flex-1 flex-col py-8 md:py-10">
      <PlanView planId={planId} />
    </main>
  );
}
