import AuthEntry from "@/components/authEntry";
import { usesFeishu } from "@/lib/feishu-session";
import { redirect } from "next/navigation";

export default function SignUpPage() {
  if (usesFeishu()) {
    redirect("/sign-in");
  }
  return <AuthEntry signUp />;
}
