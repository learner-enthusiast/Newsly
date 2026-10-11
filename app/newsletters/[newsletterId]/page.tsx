import { EditNewsletterClient } from "@/components/newsletter/EditNewsletterClient";
import { getAuthenticatedUser } from "@/lib/auth";
import { getNewsletterDetail } from "@/services/newsletter/newsletterService";
import { notFound, redirect } from "next/navigation";

/** Loads the newsletter on the server so the form renders already filled in. */
export default async function EditNewsletterPage({
  params,
}: {
  params: Promise<{ newsletterId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { newsletterId } = await params;
  const newsletter = await getNewsletterDetail(user.id, newsletterId);
  if (!newsletter) {
    notFound();
  }

  return <EditNewsletterClient newsletter={newsletter} />;
}
