import AuthEntry from "@/components/authEntry";
import { safeReturnTo } from "@/lib/feishu-session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return <AuthEntry error={params.error} next={safeReturnTo(params.next)} />;
}
