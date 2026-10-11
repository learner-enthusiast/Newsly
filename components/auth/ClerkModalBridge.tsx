"use client";

import {
  AuthenticateWithRedirectCallback,
  useAuth,
  useClerk,
} from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * There are no sign-in / sign-up pages: Clerk's sign-in and sign-up URLs point
 * at `/`, and this bridge (mounted in the root layout) turns those redirects
 * into the Clerk modal.
 *
 * - `?redirect_url=…` (from `auth.protect()` / `redirectToSignIn()`) or
 *   `?auth=sign-in|sign-up` opens the modal, then returns to `redirect_url`.
 * - `#/sso-callback` finishes an OAuth sign-in started from the modal.
 */
export function ClerkModalBridge() {
  const isSsoCallback = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.startsWith("#/sso-callback"),
    () => false,
  );

  return isSsoCallback ? <AuthenticateWithRedirectCallback /> : <ModalFromQuery />;
}

function ModalFromQuery() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();

  const mode = params.get("auth");
  const rawReturn = params.get("redirect_url");

  useEffect(() => {
    if (!isLoaded || (!mode && rawReturn === null)) return;
    const returnTo = safeReturnPath(rawReturn);

    if (isSignedIn) {
      router.replace(returnTo ?? "/home");
      return;
    }

    if (mode === "sign-up") {
      clerk.openSignUp({
        forceRedirectUrl: returnTo,
        signInForceRedirectUrl: returnTo,
      });
    } else {
      clerk.openSignIn({
        forceRedirectUrl: returnTo,
        signUpForceRedirectUrl: returnTo,
      });
    }
    // Drop the params so a refresh doesn't reopen the modal.
    router.replace(pathname, { scroll: false });
  }, [isLoaded, isSignedIn, mode, rawReturn, clerk, router, pathname]);

  return null;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Same-origin path for `redirect_url`, or undefined (open-redirect guard). */
function safeReturnPath(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === "/" ? undefined : path;
  } catch {
    return undefined;
  }
}
