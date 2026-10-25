"use client";

import { LocalizedClerkProvider } from "@/contexts/language.context";
import type { WorkspaceSession } from "@/types/session";
import { useAuth, useOrganization, useUser } from "@clerk/nextjs";
import { createContext, useContext, useMemo } from "react";

type AppSession = {
  mode: "feishu" | "clerk";
  isLoaded: boolean;
  userId: string | null;
  orgId: string | null;
  user: { id: string; fullName?: string | null } | null;
  organization: { id: string; name: string; imageUrl?: string } | null;
};

const SessionContext = createContext<AppSession | null>(null);

function ClerkSession({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, isLoaded: organizationLoaded } = useOrganization();
  return (
    <SessionContext.Provider
      value={{
        mode: "clerk",
        isLoaded: auth.isLoaded && userLoaded && organizationLoaded,
        userId: auth.userId ?? null,
        orgId: auth.orgId ?? null,
        user: user ?? null,
        organization: organization ?? null,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function AppSessionProvider({
  provider,
  session,
  children,
}: {
  provider: "feishu" | "clerk";
  session: WorkspaceSession | null;
  children: React.ReactNode;
}) {
  const feishu = useMemo<AppSession>(
    () => ({
      mode: "feishu",
      isLoaded: true,
      userId: session?.userId ?? null,
      orgId: session?.orgId || null,
      user: session ? { id: session.userId, fullName: session.name } : null,
      organization: session?.orgId ? { id: session.orgId, name: session.organizationName } : null,
    }),
    [session],
  );
  if (provider === "feishu") {
    return <SessionContext.Provider value={feishu}>{children}</SessionContext.Provider>;
  }
  return (
    <LocalizedClerkProvider
      dynamic
      signInFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/sign-in"
    >
      <ClerkSession>{children}</ClerkSession>
    </LocalizedClerkProvider>
  );
}

export function useAppSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("AppSessionProvider is missing");
  }
  return session;
}
