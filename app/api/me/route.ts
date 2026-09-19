import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { deleteUser, patchUser, putUser } from "@/repositories/user";

async function requireClerkId() {
  const { userId } = await auth();

  if (!userId) {
    return { userId: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { userId, response: null };
}

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(user);
}

export async function PUT(request: Request) {
  const { userId, response } = await requireClerkId();

  if (!userId) {
    return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getAuthenticatedUser();

  if (!existing) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await putUser(userId, await request.json());
  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const { userId, response } = await requireClerkId();

  if (!userId) {
    return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getAuthenticatedUser();

  if (!existing) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await patchUser(userId, await request.json());
  return NextResponse.json(user);
}

export async function DELETE() {
  const { userId, response } = await requireClerkId();

  if (!userId) {
    return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await deleteUser(userId);
  return NextResponse.json(user);
}
