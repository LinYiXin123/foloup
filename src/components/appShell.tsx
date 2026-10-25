"use client";

import LanguageSwitcher from "@/components/languageSwitcher";
import Navbar from "@/components/navbar";
import Providers from "@/components/providers";
import SideMenu from "@/components/sideMenu";
import { LocalizedToaster as Toaster } from "@/contexts/language.context";
import { usePathname } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.includes("/sign-in") || pathname.includes("/sign-up");
  return (
    <Providers>
      {isAuthRoute ? (
        <>
          <div className="fixed right-5 top-4 z-50">
            <LanguageSwitcher />
          </div>
          {children}
        </>
      ) : (
        <>
          <Navbar />
          <div className="flex flex-row h-screen">
            <SideMenu />
            <div className="ml-[200px] pt-[64px] h-full overflow-y-auto flex-grow">{children}</div>
          </div>
        </>
      )}
      <Toaster
        toastOptions={{
          classNames: {
            toast: "bg-white",
            title: "text-black",
            description: "text-red-400",
            actionButton: "bg-indigo-400",
            cancelButton: "bg-orange-400",
            closeButton: "bg-white-400",
          },
        }}
      />
    </Providers>
  );
}
