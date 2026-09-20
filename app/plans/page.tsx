import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/auth";
import { listUserPlans } from "@/services/plans/listUserPlans";
import type { UserPlanListItem } from "@/services/plans/listUserPlans";
import { cn } from "@/lib/utils";

function statusLabel(status: UserPlanListItem["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "draft":
      return "Draft";
    case "failed":
      return "Failed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

function PlanRow({ plan }: { plan: UserPlanListItem }) {
  return (
    <li>
      <Link
        href={`/plans/${plan.id}`}
        className="paper-card flex flex-col gap-2 p-4 ring-1 ring-border/10 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-foreground">{plan.title}</p>
          <p className="text-sm text-muted-foreground">
            {plan.festivalName} · {plan.city}, {plan.country} · {plan.year}
          </p>
          {plan.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-foreground/85">
              {plan.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
              plan.status === "ready" && "bg-accent/30 text-foreground",
              plan.status === "processing" && "bg-muted text-muted-foreground",
              plan.status === "failed" && "bg-destructive/15 text-destructive",
              plan.status === "draft" && "bg-secondary text-secondary-foreground",
              plan.status === "archived" && "bg-muted/80 text-muted-foreground",
            )}
          >
            {statusLabel(plan.status)}
          </span>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(plan.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function PlansPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/");
  }

  const plans = await listUserPlans(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-foreground">Your plans</h1>
          <p className="text-sm text-muted-foreground">
            Festival routes you&apos;ve started or finished building.
          </p>
        </div>
        <Button render={<Link href="/" />}>Plan another trip</Button>
      </div>

      {plans.length === 0 ? (
        <div className="paper-card flex flex-col items-start gap-3 p-6 ring-1 ring-border/10">
          <p className="text-foreground">No plans yet.</p>
          <p className="text-sm text-muted-foreground">
            From the home page, describe a festival trip and we&apos;ll build your
            first route.
          </p>
          <Button render={<Link href="/" />}>Start planning</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </ul>
      )}
    </main>
  );
}
