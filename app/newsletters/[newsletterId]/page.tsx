"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function EditNewsletterPage() {
  const params = useParams<{ newsletterId: string }>();
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">
        Full edit form for newsletter <code>{params.newsletterId}</code> is not
        wired yet. Pause, resume, send test, and delete from the list page.
      </p>
      <Link
        href="/newsletters"
        className="mt-4 inline-flex h-9 items-center rounded-md border px-4 text-sm"
      >
        Back to newsletters
      </Link>
    </div>
  );
}
