import { requireAuthenticatedUser } from "@/lib/auth";
import {
  createNewsletterForUser,
  listNewsletters,
} from "@/services/newsletter/newsletterService";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const newsletters = await listNewsletters(user.id);
  return NextResponse.json({ newsletters });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const newsletter = await createNewsletterForUser(user.id, body);
    return NextResponse.json({ newsletter }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: z.treeifyError(error) },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
