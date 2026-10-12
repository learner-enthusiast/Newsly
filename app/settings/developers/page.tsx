import { DevelopersClient } from "@/components/developers/DevelopersClient";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirectToSignInModal } from "@/lib/redirectToSignInModal";
import { getDevelopersPayload } from "@/services/developers/apiKeyService";
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

  const initial = await getDevelopersPayload(user.id);
  return <DevelopersClient initial={initial} />;
}
