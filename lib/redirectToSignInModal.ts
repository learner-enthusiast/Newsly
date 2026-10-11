import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Signed-out: redirect to Clerk's sign-in URL (`/`), where `ClerkModalBridge`
 * opens the sign-in modal and returns to this page afterwards.
 * Signed in to Clerk but no local user yet: go to the signed-in home.
 */
export async function redirectToSignInModal(): Promise<never> {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }
  redirect("/home");
}
