"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

export function SyncLocalUser() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    void fetch("/api/me");
  }, [isSignedIn]);

  return null;
}
