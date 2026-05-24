"use client";

/**
 * Notification preferences for portfolio events.
 *
 * Stored in localStorage for this wave; the backend persistence is a
 * follow-up. Validates webhook URLs to avoid surprises later.
 *
 * Storage key: `waifu:portfolio:notifications:v1`
 *
 *   {
 *     telegramChatId?: string,
 *     telegramBotToken?: string,
 *     discordWebhookUrl?: string,
 *     events: { claimable: boolean, launched: boolean, closed: boolean },
 *   }
 */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/locale-context";

const STORAGE_KEY = "waifu:portfolio:notifications:v1";

type Settings = {
	telegramChatId: string;
	telegramBotToken: string;
	discordWebhookUrl: string;
	events: {
		claimable: boolean;
		launched: boolean;
		closed: boolean;
	};
};

const DEFAULT: Settings = {
	telegramChatId: "",
	telegramBotToken: "",
	discordWebhookUrl: "",
	events: { claimable: true, launched: true, closed: false },
};

function load(): Settings {
	if (typeof window === "undefined") return DEFAULT;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT;
		const parsed = JSON.parse(raw) as Partial<Settings>;
		return {
			telegramChatId: typeof parsed.telegramChatId === "string" ? parsed.telegramChatId : "",
			telegramBotToken: typeof parsed.telegramBotToken === "string" ? parsed.telegramBotToken : "",
			discordWebhookUrl: typeof parsed.discordWebhookUrl === "string" ? parsed.discordWebhookUrl : "",
			events: {
				claimable: parsed.events?.claimable ?? true,
				launched: parsed.events?.launched ?? true,
				closed: parsed.events?.closed ?? false,
			},
		};
	} catch {
		return DEFAULT;
	}
}

function isValidWebhookUrl(value: string): boolean {
	if (!value) return true; // empty = unset, fine.
	try {
		const u = new URL(value);
		return u.protocol === "https:" && /discord\.com|discordapp\.com/.test(u.hostname);
	} catch {
		return false;
	}
}

export default function NotificationSettings() {
	const { t } = useTranslation();
	const [settings, setSettings] = useState<Settings>(DEFAULT);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [discordError, setDiscordError] = useState<string | null>(null);

	useEffect(() => {
		setSettings(load());
	}, []);

	const persist = useCallback(
		(next: Settings) => {
			setSettings(next);
			if (next.discordWebhookUrl && !isValidWebhookUrl(next.discordWebhookUrl)) {
				setDiscordError(t("portfolio.notifications.discordError"));
				return;
			}
			setDiscordError(null);
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
				setSavedAt(Date.now());
			} catch {
				// quota / private mode, silent. settings stay in memory.
			}
		},
		[t],
	);

	return (
		<section className="border border-stroke-strong rounded-sm bg-[#0C0C0C] p-5 flex flex-col gap-5">
			<header className="flex items-center justify-between">
				<div>
					<h2 className="text-white font-medium">{t("portfolio.notifications.title")}</h2>
					<p className="text-xs text-neutral-500 mt-0.5">{t("portfolio.notifications.subtitle")}</p>
				</div>
				{savedAt ? (
					<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#00ff87]">
						{t("portfolio.notifications.saved")}
					</span>
				) : null}
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-2">
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
						{t("portfolio.notifications.telegramChatId")}
					</span>
					<input
						type="text"
						value={settings.telegramChatId}
						onChange={(e) => persist({ ...settings, telegramChatId: e.target.value.trim() })}
						placeholder={t("portfolio.notifications.telegramChatPlaceholder")}
						className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-[#00ff87]/40"
					/>
				</label>
				<label className="flex flex-col gap-2">
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
						{t("portfolio.notifications.telegramBotToken")}
					</span>
					<input
						type="password"
						value={settings.telegramBotToken}
						onChange={(e) => persist({ ...settings, telegramBotToken: e.target.value.trim() })}
						placeholder={t("portfolio.notifications.telegramBotPlaceholder")}
						autoComplete="off"
						className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-[#00ff87]/40"
					/>
				</label>
			</div>

			<label className="flex flex-col gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
					{t("portfolio.notifications.discordWebhook")}
				</span>
				<input
					type="url"
					value={settings.discordWebhookUrl}
					onChange={(e) => persist({ ...settings, discordWebhookUrl: e.target.value.trim() })}
					placeholder={t("portfolio.notifications.discordWebhookPlaceholder")}
					className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-[#00ff87]/40"
				/>
				{discordError ? <span className="text-xs text-red-400">{discordError}</span> : null}
			</label>

			<fieldset className="flex flex-col gap-2">
				<legend className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 mb-2">
					{t("portfolio.notifications.events")}
				</legend>
				{[
					{ key: "claimable" as const, label: t("portfolio.notifications.eventClaimable") },
					{ key: "launched" as const, label: t("portfolio.notifications.eventLaunched") },
					{ key: "closed" as const, label: t("portfolio.notifications.eventClosed") },
				].map((opt) => (
					<label key={opt.key} className="flex items-center gap-3 text-sm text-zinc-300">
						<input
							type="checkbox"
							checked={settings.events[opt.key]}
							onChange={(e) => persist({ ...settings, events: { ...settings.events, [opt.key]: e.target.checked } })}
							className="size-4 accent-[#00ff87]"
						/>
						{opt.label}
					</label>
				))}
			</fieldset>

			<div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px] text-neutral-500">
				<span>{t("portfolio.notifications.storedLocally")}</span>
				<Button
					type="button"
					variant="outline"
					className="h-8 px-3 text-xs"
					onClick={() => {
						persist(DEFAULT);
					}}
				>
					{t("portfolio.notifications.reset")}
				</Button>
			</div>
		</section>
	);
}
