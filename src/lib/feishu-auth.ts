import { SESSION_COOKIE, readFeishuSession } from "@/lib/feishu-session";
import { cookies } from "next/headers";

export async function getFeishuSession() {
  return readFeishuSession((await cookies()).get(SESSION_COOKIE)?.value);
}
