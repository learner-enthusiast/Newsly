import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getNewsletterDetail,
  removeNewsletter,
  updateNewsletterForUser,
} from "@/services/newsletter/newsletterService";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  _request: Request,
  context: { params: Promise<{ newsletterId: string }> },
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { newsletterId } = await context.params;
  const newsletter = await getNewsletterDetail(user.id, newsletterId);
  if (!newsletter) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ newsletter });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ newsletterId: string }> },
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { newsletterId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const newsletter = await updateNewsletterForUser(
      user.id,
      newsletterId,
      body,
    );
    if (!newsletter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ newsletter });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: z.treeifyError(error) },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ newsletterId: string }> },
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { newsletterId } = await context.params;
  const ok = await removeNewsletter(user.id, newsletterId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
