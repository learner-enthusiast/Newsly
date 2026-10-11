/**
 * Start one real chat message or news briefing through the same service calls
 * the API routes make (with a real user's Clerk id as end user), wait for it,
 * and print the Neatlogs trace id. Needs `pnpm dev` and `pnpm inngest:dev`.
 *
 * Usage: pnpm trace:flow -- --flow chat [--prompt "..."]
 *        pnpm trace:flow -- --flow news [--story-count 3]
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { neatlogsClient } from "@/clients/neatlogsClient";
import { prisma } from "@/db";
import { MESSAGE_CHAT_PIPELINE_EVENT } from "@/inngest/chatPipeline";
import { NEWS_PIPELINE_EVENT } from "@/inngest/newsPipeline";
import { createGeneralChatSession } from "@/services/chat/createGeneralChatSession";
import { sendChatMessage } from "@/services/chat/sendChatMessage";
import { requestNews } from "@/services/news/apiService";

const { values } = parseArgs({
  options: {
    flow: { type: "string" },
    prompt: {
      type: "string",
      default: "What moved Indian bank stocks this week, and what should I watch next?",
    },
    "story-count": { type: "string", default: "3" },
    "timeout-min": { type: "string", default: "15" },
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The trace id is only known inside the process that opened the root; read it from the event. */
async function traceIdForEvent(
  name: string,
  match: (data: Record<string, unknown>) => boolean,
) {
  const res = await fetch("http://localhost:8288/v1/events?limit=50");
  const body = (await res.json()) as {
    data?: Array<{ name?: string; data?: Record<string, unknown> }>;
  };
  const event = body.data?.find((row) => row.name === name && row.data && match(row.data));
  const trace = event?.data?.trace as { carrier?: { traceparent?: string }; runId?: string } | undefined;
  return {
    runId: trace?.runId ?? null,
    traceId: trace?.carrier?.traceparent?.split("-")[1] ?? null,
  };
}

async function waitFor(check: () => Promise<string | null>): Promise<string> {
  const deadline = Date.now() + Number(values["timeout-min"]) * 60_000;
  while (Date.now() < deadline) {
    const status = await check();
    if (status) return status;
    await sleep(5_000);
  }
  return "TIMEOUT";
}

async function runChat(user: { id: string; clerkId: string }) {
  const session = await createGeneralChatSession(user.id);
  const chatSessionId = session.chatSession.id;
  const result = await sendChatMessage({
    userId: user.id,
    endUserId: user.clerkId,
    chatSessionId,
    content: values.prompt!,
  });
  if (!result) throw new Error("sendChatMessage returned null");
  await neatlogsClient.flush();
  const ids = await traceIdForEvent(MESSAGE_CHAT_PIPELINE_EVENT, (data) => data.chatMessageId === result.chatMessageId);
  console.log(JSON.stringify({ flow: "chat", chatSessionId, chatMessageId: result.chatMessageId, ...ids }));

  const status = await waitFor(async () => {
    const reply = await prisma.chatMessage.findFirst({
      where: { chatSessionId, role: { in: ["assistant", "agent"] } },
      select: { id: true },
    });
    return reply ? "REPLIED" : null;
  });
  console.log(JSON.stringify({ status }));
}

async function runNews(user: { id: string; clerkId: string }) {
  // requestNews de-duplicates by (date, scope, location); walk back to a free date.
  let date = new Date();
  for (let i = 0; i < 30; i += 1) {
    const iso = date.toISOString().slice(0, 10);
    const existing = await prisma.newsRequest.findFirst({
      where: { userId: user.id, scope: "world", date: new Date(`${iso}T00:00:00.000Z`) },
      select: { id: true },
    });
    if (!existing) break;
    date = new Date(date.getTime() - 86_400_000);
  }
  const iso = date.toISOString().slice(0, 10);
  const result = await requestNews(
    user.id,
    { date: iso, scope: "world", storyCount: Number(values["story-count"]) },
    user.clerkId,
  );
  await neatlogsClient.flush();
  const newsRequestId = result.newsRequest.id;
  const ids = await traceIdForEvent(NEWS_PIPELINE_EVENT, (data) => data.newsRequestId === newsRequestId);
  console.log(JSON.stringify({ flow: "news", newsRequestId, date: iso, ...ids }));

  const status = await waitFor(async () => {
    const row = await prisma.newsRequest.findUnique({
      where: { id: newsRequestId },
      select: { status: true },
    });
    return row && row.status !== "pending" ? row.status : null;
  });
  console.log(JSON.stringify({ status }));
}

async function main() {
  await neatlogsClient.ready();
  const user = await prisma.user.findFirst({
    where: { clerkId: { startsWith: "user_" } },
    select: { id: true, clerkId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) throw new Error("No Clerk-backed user in the database");

  if (values.flow === "chat") await runChat(user);
  else if (values.flow === "news") await runNews(user);
  else throw new Error("--flow chat|news");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
