"use client";

import { useLanguage } from "@/contexts/language.context";
import { useAppSession } from "@/contexts/session.context";
import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";

const errors: Record<string, string> = {
  invalid_state: "Login expired. Please start again.",
  cancelled: "Feishu authorization was cancelled. You can try again.",
  provider_error: "Could not complete Feishu login. Please retry or check the app configuration.",
};

export default function AuthEntry({
  error,
  next = "/dashboard",
  signUp = false,
}: { error?: string; next?: string; signUp?: boolean }) {
  const { t } = useLanguage();
  const { mode, userId } = useAppSession();
  if (mode === "clerk") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        {signUp ? (
          <SignUp forceRedirectUrl="/dashboard" />
        ) : (
          <SignIn forceRedirectUrl="/dashboard" />
        )}
      </div>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-9 shadow-sm">
        <p className="mb-8 text-3xl font-bold">
          Folo<span className="text-indigo-600">Up</span>
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">{t("Sign in with Feishu")}</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-slate-500">
          {t("Sign in to manage interviews and view reports.")}
        </p>
        {error && errors[error] && (
          <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {t(errors[error])}
          </p>
        )}
        <a
          href={`/api/auth/feishu?next=${encodeURIComponent(next)}`}
          className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          {t("Continue with Feishu")}
        </a>
        {userId && (
          <Link href="/dashboard" className="mt-4 block text-center text-sm text-indigo-600">
            {t("Back to dashboard")}
          </Link>
        )}
      </div>
    </main>
  );
}
