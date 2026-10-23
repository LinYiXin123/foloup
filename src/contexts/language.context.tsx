"use client";

import { type Locale, translate } from "@/lib/i18n/messages";
import { enUS, zhCN } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toaster } from "sonner";

export const LANGUAGE_STORAGE_KEY = "foloup.language";
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string, values?: Record<string, string | number>) => string;
} | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("zh-CN");
  const localeRef = useRef(locale);
  localeRef.current = locale;
  // Keep this function stable so changing UI language does not reconnect a live call.
  const t = useCallback(
    (message: string, values?: Record<string, string | number>) =>
      translate(message, localeRef.current, values),
    [],
  );
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === "en" || saved === "zh-CN") {
        updateLocale(saved);
      }
    } catch {
      /* Chinese remains the default when storage is unavailable. */
    }
    const sync = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY) {
        updateLocale(event.newValue === "en" ? "en" : "zh-CN");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("LanguageProvider is required");
  }
  return value;
}

export function LocalizedClerkProvider(props: React.ComponentProps<typeof ClerkProvider>) {
  const { locale } = useLanguage();
  return <ClerkProvider {...props} localization={locale === "zh-CN" ? zhCN : enUS} />;
}

export function LocalizedToaster(props: React.ComponentProps<typeof Toaster>) {
  const { t } = useLanguage();
  return <Toaster {...props} containerAriaLabel={t("Notifications")} />;
}
