import "../globals.css";
import AppShell from "@/components/appShell";
import { LanguageProvider } from "@/contexts/language.context";
import { AppSessionProvider } from "@/contexts/session.context";
import { getFeishuSession } from "@/lib/feishu-auth";
import { usesFeishu } from "@/lib/feishu-session";
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const title = "FoloUp";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const feishu = usesFeishu();
  const session = feishu ? await getFeishuSession() : null;
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <title>{title}</title>
        <meta name="description" content="AI 智能面试" />
        <link rel="icon" href="/browser-client-icon.ico" />
      </head>
      <body className={cn(inter.className, "antialiased overflow-hidden min-h-screen")}>
        <LanguageProvider>
          <AppSessionProvider provider={feishu ? "feishu" : "clerk"} session={session}>
            <AppShell>{children}</AppShell>
          </AppSessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
