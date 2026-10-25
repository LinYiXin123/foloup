import { createHash, randomBytes } from "node:crypto";
import type { WorkspaceSession } from "@/types/session";
import { EncryptJWT, type JWTPayload, jwtDecrypt } from "jose";

export const SESSION_COOKIE = "foloup_feishu_session";
export const OAUTH_COOKIE = "foloup_feishu_oauth";
export const SESSION_SECONDS = 8 * 60 * 60;
export const OAUTH_SECONDS = 10 * 60;

export type FeishuIdentity = { openId: string; tenantKey: string; name: string; email?: string };

export function usesFeishu() {
  return process.env.AUTH_PROVIDER === "feishu";
}

export function getFeishuConfig() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  const secret = process.env.AUTH_SESSION_SECRET;
  const base = new URL(process.env.AUTH_URL || "http://localhost:3000");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    !appId ||
    !appSecret ||
    !secret ||
    secret.length < 32 ||
    base.username ||
    base.password ||
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback))
  ) {
    throw new Error("Feishu login is not configured");
  }
  return {
    appId,
    appSecret,
    origin: base.origin,
    redirectUri: `${base.origin}/api/auth/feishu/callback`,
    secure: base.protocol === "https:",
    key: createHash("sha256").update(secret).digest(),
  };
}

export function safeReturnTo(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) {
    return "/dashboard";
  }
  const url = new URL(value, "https://local.invalid");
  if (!/^\/(dashboard|interviews)(\/|$)/.test(url.pathname)) {
    return "/dashboard";
  }
  return `${url.pathname}${url.search}`;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getFeishuConfig().secure,
    path: "/",
    maxAge,
  };
}

export async function seal(payload: JWTPayload, purpose: "oauth" | "session", seconds: number) {
  const config = getFeishuConfig();
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("foloup")
    .setAudience(`${config.appId}:${purpose}`)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .encrypt(config.key);
}

export async function unseal(value: string | undefined, purpose: "oauth" | "session") {
  if (!value) {
    return null;
  }
  try {
    const config = getFeishuConfig();
    const { payload } = await jwtDecrypt(value, config.key, {
      issuer: "foloup",
      audience: `${config.appId}:${purpose}`,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function createOAuthRequest(next?: string | null) {
  const config = getFeishuConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  url.search = new URLSearchParams({
    client_id: config.appId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), transaction: { state, verifier, next: safeReturnTo(next) } };
}

// A verified Feishu identity gets its own workspace unless explicitly bound by the
// server administrator. Never link accounts by the returned (unverified) email.
export function resolveFeishuWorkspace(identity: FeishuIdentity): WorkspaceSession {
  const config = getFeishuConfig();
  const id = `feishu_${createHash("sha256")
    .update(`${config.appId}:${identity.tenantKey}:${identity.openId}`)
    .digest("hex")
    .slice(0, 32)}`;
  const bindings = JSON.parse(process.env.FEISHU_USER_BINDINGS || "{}");
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new Error("Invalid Feishu workspace bindings");
  }
  const binding = Object.hasOwn(bindings, id) ? bindings[id] : null;
  if (
    binding &&
    ((binding.tenantKey && binding.tenantKey !== identity.tenantKey) ||
      typeof binding.userId !== "string" ||
      typeof binding.orgId !== "string" ||
      !/^[\w-]+$/.test(binding.userId) ||
      !/^[\w-]+$/.test(binding.orgId))
  ) {
    throw new Error("Invalid Feishu workspace binding");
  }
  return {
    userId: binding?.userId || id,
    orgId: binding?.orgId || id,
    organizationName: binding?.organizationName || `${identity.name}的工作区`,
    name: identity.name,
    email: identity.email,
  };
}

export async function readFeishuSession(value?: string) {
  const identity = await unseal(value, "session");
  if (
    !identity ||
    typeof identity.openId !== "string" ||
    !identity.openId ||
    typeof identity.tenantKey !== "string" ||
    !identity.tenantKey ||
    typeof identity.name !== "string"
  ) {
    return null;
  }
  return resolveFeishuWorkspace({
    openId: identity.openId,
    tenantKey: identity.tenantKey,
    name: identity.name,
    email: typeof identity.email === "string" ? identity.email : undefined,
  });
}
