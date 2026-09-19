import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  planningRequestSchema,
  runPlannerIntakeAgent,
} from "@/services/AIAgents.ts/researchagent";

const intakeBodySchema = z.object({
  message: z.string().min(1, "message is required"),
  previousRequest: planningRequestSchema.optional().nullable(),
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

  return NextResponse.json(result);
}
