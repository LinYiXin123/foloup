import type { Interview } from "@/types/interview";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export type SignedInUser = { userId: string; orgId: string };

// Route handlers check auth themselves: the proxy is only an optimistic first gate.
export async function requireUser(): Promise<
  { user: SignedInUser; error?: never } | { user?: never; error: NextResponse }
> {
  const { userId, orgId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user: { userId, orgId: orgId ?? "" } };
}

// For server actions, which have no HTTP response to return: throw instead.
export async function getSignedInUser(): Promise<SignedInUser> {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  return { userId, orgId: orgId ?? "" };
}

// Same rule the dashboard uses to list interviews: owned by the user or by their active org.
export function canAccessInterview(
  interview: Pick<Interview, "user_id" | "organization_id"> | null | undefined,
  user: SignedInUser,
) {
  if (!interview) {
    return false;
  }

  return (
    interview.user_id === user.userId ||
    (user.orgId !== "" && interview.organization_id === user.orgId)
  );
}
