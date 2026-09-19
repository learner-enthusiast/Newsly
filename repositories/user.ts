import type { User as ClerkUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/db";

const clerkIdSchema = z.string().min(1, "clerkId is required");

const userWriteSchema = z.object({
  clerkId: clerkIdSchema,
  email: z.email(),
  firstName: z.string().min(1).nullable().optional(),
  lastName: z.string().min(1).nullable().optional(),
  username: z.string().min(1).nullable().optional(),
  imageUrl: z.string().min(1).nullable().optional(),
  hasImage: z.boolean().optional(),
  primaryEmailAddressId: z.string().min(1).nullable().optional(),
  lastSignInAt: z.coerce.date().nullable().optional(),
  lastActiveAt: z.coerce.date().nullable().optional(),
  banned: z.boolean().optional(),
  locked: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
  locale: z.string().min(1).nullable().optional(),
});

const userPutSchema = userWriteSchema.omit({ clerkId: true });
const userPatchSchema = userPutSchema.partial();

export type UserCreateInput = z.input<typeof userWriteSchema>;
export type UserPutInput = z.input<typeof userPutSchema>;
export type UserPatchInput = z.input<typeof userPatchSchema>;

export function clerkUserToCreateInput(user: ClerkUser): UserCreateInput {
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("Clerk user has no email address");
  }

  return {
    clerkId: user.id,
    email,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    imageUrl: user.imageUrl,
    hasImage: user.hasImage,
    primaryEmailAddressId: user.primaryEmailAddressId,
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt) : null,
    lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt) : null,
    banned: user.banned,
    locked: user.locked,
    twoFactorEnabled: user.twoFactorEnabled,
    locale: user.locale,
  };
}

export async function createUser(input: UserCreateInput) {
  return prisma.user.create({
    data: userWriteSchema.parse(input),
  });
}

export async function putUser(clerkId: string, input: UserPutInput) {
  return prisma.user.update({
    where: { clerkId: clerkIdSchema.parse(clerkId) },
    data: userPutSchema.parse(input),
  });
}

export async function patchUser(clerkId: string, input: UserPatchInput) {
  return prisma.user.update({
    where: { clerkId: clerkIdSchema.parse(clerkId) },
    data: userPatchSchema.parse(input),
  });
}

export async function deleteUser(clerkId: string) {
  return prisma.user.delete({
    where: { clerkId: clerkIdSchema.parse(clerkId) },
  });
}

export async function getUserByClerkId(clerkId: string) {
  return prisma.user.findUnique({
    where: { clerkId: clerkIdSchema.parse(clerkId) },
  });
}

export async function upsertUserFromClerk(user: ClerkUser) {
  const data = userWriteSchema.parse(clerkUserToCreateInput(user));
  const { clerkId, ...update } = data;

  return prisma.user.upsert({
    where: { clerkId },
    create: data,
    update,
  });
}
