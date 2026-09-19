import { PlanView } from "./plan-view";

type PlanPageProps = {
  params: Promise<{ planId: string }>;
};

export default async function PlanPage({ params }: PlanPageProps) {
  const { planId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <PlanView planId={planId} />
    </main>
  );
}
