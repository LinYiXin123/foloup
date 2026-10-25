import { type FeishuIdentity, getFeishuConfig } from "@/lib/feishu-session";
import { createServiceClient } from "@/lib/supabase";
import type { WorkspaceSession } from "@/types/session";

export class FeishuLoginError extends Error {
  constructor(
    public stage: "token" | "profile" | "workspace",
    public code?: number,
  ) {
    super(`Feishu login failed at ${stage}`);
  }
}

export async function exchangeFeishuCode(code: string, verifier: string): Promise<FeishuIdentity> {
  const config = getFeishuConfig();
  // Feishu's current v1 authorization page documents PKCE with the v2 token
  // endpoint. Keep this pair together until its v3 PKCE support is available.
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });
  const token = await response.json();
  if (
    !response.ok ||
    token.code !== 0 ||
    typeof token.access_token !== "string" ||
    !token.access_token
  ) {
    throw new FeishuLoginError(
      "token",
      typeof token.code === "number" ? token.code : response.status,
    );
  }
  const profileResponse = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  const profile = await profileResponse.json();
  const data = profile.data;
  if (
    !profileResponse.ok ||
    profile.code !== 0 ||
    typeof data?.open_id !== "string" ||
    !data.open_id ||
    typeof data.tenant_key !== "string" ||
    !data.tenant_key ||
    typeof data.name !== "string" ||
    !data.name
  ) {
    throw new FeishuLoginError(
      "profile",
      typeof profile.code === "number" ? profile.code : profileResponse.status,
    );
  }
  // The access token is only used for this identity lookup and is never persisted.
  return {
    openId: data.open_id,
    tenantKey: data.tenant_key,
    name: data.name,
    email: typeof data.email === "string" ? data.email : undefined,
  };
}

export async function ensureFeishuWorkspace(session: WorkspaceSession) {
  const db = createServiceClient();
  const { error: orgError } = await db.from("organization").upsert(
    {
      id: session.orgId,
      name: session.organizationName,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (orgError) {
    throw new FeishuLoginError("workspace");
  }
  const { error: userError } = await db.from("user").upsert(
    {
      id: session.userId,
      email: session.email || null,
      organization_id: session.orgId,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (userError) {
    throw new FeishuLoginError("workspace");
  }
}
