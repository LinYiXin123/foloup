"use client";

import LanguageSwitcher from "@/components/languageSwitcher";
import { useLanguage } from "@/contexts/language.context";
import { useAppSession } from "@/contexts/session.context";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import React from "react";

function Navbar() {
  const { t } = useLanguage();
  const { mode, organization, user } = useAppSession();
  return (
    <div className="fixed inset-x-0 top-0 bg-slate-100  z-[10] h-fit  py-4 ">
      <div className="flex items-center justify-between h-full gap-2 px-8 mx-auto">
        <div className="flex flex-row gap-3 justify-center">
          <Link href={"/dashboard"} className="flex items-center gap-2">
            <p className="px-2 py-1 text-2xl font-bold text-black">
              Folo<span className="text-indigo-600">Up</span>{" "}
              <span className="text-[8px]">{t("Beta")}</span>
            </p>
          </Link>
          <p className="my-auto text-xl">/</p>
          <div className="my-auto">
            {mode === "feishu" ? (
              <span className="text-sm font-medium">{organization?.name}</span>
            ) : (
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                hidePersonal={true}
                afterSelectOrganizationUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                appearance={{
                  variables: {
                    fontSize: "0.9rem",
                  },
                }}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {mode === "feishu" && (
            <span className="text-sm text-slate-600">
              {t("Feishu")} · {user?.fullName}
            </span>
          )}
          {mode === "feishu" ? (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-sm text-slate-600 hover:text-indigo-600">
                {t("Sign out")}
              </button>
            </form>
          ) : (
            <UserButton afterSignOutUrl="/sign-in" signInUrl="/sign-in" />
          )}
        </div>
      </div>
    </div>
  );
}

export default Navbar;
