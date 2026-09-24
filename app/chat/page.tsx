import { getAuthenticatedUser } from "@/lib/auth";
import { listUserChatSessionsForUi } from "@/services/chat/newsStoryChatService";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ChatIndexPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/sign-in");
  }

  const sessions = await listUserChatSessionsForUi(user.id);
  if (sessions.length > 0) {
    redirect(`/chat/${sessions[0]!.id}`);
  }

  return (
    <main className="landing-section flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-24 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        No chats yet
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Start a deep dive from a news story to open your first research chat.
      </p>
      <Link
        href="/news"
        className={cn(buttonVariants({ variant: "default" }), "mt-8")}
      >
        Browse news
      </Link>
    </main>
  );
}
