"use client";

import { useLanguage } from "@/contexts/language.context";
import { Languages } from "lucide-react";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{locale === "zh-CN" ? "界面语言" : "Interface language"}</span>
      <select
        aria-label={locale === "zh-CN" ? "界面语言" : "Interface language"}
        value={locale}
        onChange={(event) => setLocale(event.target.value === "en" ? "en" : "zh-CN")}
        className="bg-transparent focus:outline-none"
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
