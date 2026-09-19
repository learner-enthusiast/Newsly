import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { createReadyPlan } from "@/services/planner/createReadyPlan";
import {
  planningRequestSchema,
  runPlannerIntakeAgent,
} from "@/services/AIAgents.ts/researchagent";

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const intakeBodySchema = z.object({
  message: z.string().min(1, "message is required"),
  previousRequest: planningRequestSchema.optional().nullable(),
  conversation: z.array(conversationMessageSchema).optional(),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof intakeBodySchema>;

  try {
    body = intakeBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await runPlannerIntakeAgent({
    message: body.message,
    previousRequest: body.previousRequest,
  });

  console.info(
    JSON.stringify({
      scope: "planner.intake",
      status: result.status,
      userId: user.id,
      missing: result.status === "needs_input" ? result.missing : undefined,
    }),
  );

  if (result.status === "needs_input") {
    return NextResponse.json(result);
  }

  const created = await createReadyPlan({
    userId: user.id,
    request: result.request,
    message: body.message,
    conversation: body.conversation,
  });

  return NextResponse.json(created);
}
