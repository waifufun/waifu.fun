"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import enMessages from "@/locales/en.json";
import zhMessagesImport from "@/locales/zh.json";

const LOCALE_STORAGE_KEY = "waifu_locale";

export type Locale = "en" | "zh";

type Messages = Record<string, unknown>;

const zhMessages = zhMessagesImport as Messages;
const enMessagesTyped = enMessages as Messages;

function getNested(obj: Messages, path: string): string | undefined {
	const keys = path.split(".");
	let current: unknown = obj;
	for (const key of keys) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return typeof current === "string" ? current : undefined;
}

const LocaleContext = createContext<{
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: string, params?: Record<string, string>) => string;
	messages: Messages;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>("en");
	const messages = locale === "zh" ? zhMessages : enMessagesTyped;

	useEffect(() => {
		if (typeof window === "undefined") return;
		const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
		if (stored === "en" || stored === "zh") setLocaleState(stored);
	}, []);

	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
	}, [locale]);

	const setLocale = useCallback((newLocale: Locale) => {
		setLocaleState(newLocale);
		if (typeof window !== "undefined") localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
	}, []);

	const t = useCallback(
		(key: string, params?: Record<string, string>): string => {
			let value = getNested(messages, key);
			if (value === undefined) value = getNested(enMessagesTyped, key);
			if (value === undefined) return key;
			let str = String(value);
			if (params) {
				for (const [k, v] of Object.entries(params)) {
					str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
				}
			}
			return str;
		},
		[messages],
	);

	const value = useMemo(() => ({ locale, setLocale, t, messages }), [locale, setLocale, t, messages]);

	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
	const ctx = useContext(LocaleContext);
	if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
	return ctx;
}

export function useTranslation() {
	const { t, locale, setLocale } = useLocale();
	return { t, locale, setLocale };
}
