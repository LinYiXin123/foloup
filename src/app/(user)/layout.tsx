import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import LanguageSwitcher from "@/components/languageSwitcher";
import Providers from "@/components/providers";
import { LanguageProvider, LocalizedToaster as Toaster } from "@/contexts/language.context";
import { AppSessionProvider } from "@/contexts/session.context";
import { getFeishuSession } from "@/lib/feishu-auth";
import { usesFeishu } from "@/lib/feishu-session";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "FoloUp",
  description: "AI 智能面试",
  openGraph: {
    title: "FoloUp",
    description: "AI-powered Interviews",
    siteName: "FoloUp",
    images: [
      {
        url: "/foloup.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const feishu = usesFeishu();
  const session = feishu ? await getFeishuSession() : null;
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/browser-user-icon.ico" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>
          <AppSessionProvider provider={feishu ? "feishu" : "clerk"} session={session}>
            <Providers>
              <div className="fixed right-4 top-3 z-50">
                <LanguageSwitcher />
              </div>
              {children}
              <Toaster
                toastOptions={{
                  classNames: {
                    toast: "bg-white border-2 border-indigo-400",
                    title: "text-black",
                    description: "text-red-400",
                    actionButton: "bg-indigo-400",
                    cancelButton: "bg-orange-400",
                    closeButton: "bg-lime-400",
                  },
                }}
              />
            </Providers>
          </AppSessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
