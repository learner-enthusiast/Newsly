import { UnsubscribeNewsletterClient } from "@/components/newsletter/UnsubscribeNewsletterClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribeToken";
import { getNewsletterById } from "@/repositories/newsletter";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unsubscribe — Newsly",
  robots: { index: false, follow: false },
};

type UnsubscribePageProps = {
  searchParams: Promise<{ id?: string; token?: string }>;
};

function InvalidUnsubscribeLink() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Invalid unsubscribe link</CardTitle>
          <CardDescription>
            This link may be expired, incomplete, or invalid. Use the
            unsubscribe link in your latest digest email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Go to homepage
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: UnsubscribePageProps) {
  const { id, token } = await searchParams;

  if (!id?.trim() || !token?.trim()) {
    return <InvalidUnsubscribeLink />;
  }

  let tokenValid = false;
  try {
    tokenValid = verifyNewsletterUnsubscribeToken(id, token);
  } catch {
    tokenValid = false;
  }

  if (!tokenValid) {
    return <InvalidUnsubscribeLink />;
  }

  const newsletter = await getNewsletterById(id);
  if (!newsletter) {
    return <InvalidUnsubscribeLink />;
  }

  return (
    <UnsubscribeNewsletterClient
      newsletterId={id}
      token={token}
      newsletter={{
        name: newsletter.name,
        email: newsletter.email,
        scope: newsletter.scope,
        storyCount: newsletter.storyCount,
        location: newsletter.location,
        frequency: newsletter.frequency,
        sendTimeLocal: newsletter.sendTimeLocal,
        timezone: newsletter.timezone,
        isActive: newsletter.isActive,
      }}
    />
  );
}
