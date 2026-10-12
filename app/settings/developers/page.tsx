import { DevelopersClient } from "@/components/developers/DevelopersClient";
import { YourUsageCard } from "@/components/developers/YourUsageCard";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirectToSignInModal } from "@/lib/redirectToSignInModal";
import { getDevelopersPayload } from "@/services/developers/apiKeyService";
import { istMonthStart } from "@/lib/usage/istTime";
import { getUserFeatureUsage } from "@/lib/usage/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developers — Dainik Samachar",
  description: "API keys and usage for the Dainik Samachar API.",
};

export default async function DevelopersPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return redirectToSignInModal();
  }

  const now = new Date();
  const [initial, usage] = await Promise.all([
    getDevelopersPayload(user.id),
    getUserFeatureUsage(user.id, { from: istMonthStart(now), to: now }),
  ]);
  return (
    <DevelopersClient initial={initial}>
      <YourUsageCard usage={usage} />
    </DevelopersClient>
  );
}
