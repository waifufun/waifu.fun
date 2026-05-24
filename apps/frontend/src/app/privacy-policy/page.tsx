"use client";

import { useTranslation } from "@/contexts/locale-context";

// REVIEW LEGAL: this entire page is consequential legal text.
// Every key under legal.privacy.* in en.json and zh.json needs a human
// legal reviewer (preferably someone literate in both English-language
// privacy law and the zh translation conventions for the same).
//
// Server-side metadata stays in layout.tsx (en-only for now). The body
// is now client-rendered to enable i18n. Trade-off documented in handoff.
//
// Section structure mirrors the source policy 1:1 (s1..s17 keys). Items
// (s4Item1..s4Item4 etc) are bulleted children under the parent body.

type Section = {
	headerKey?: string;
	subheaderKey?: string;
	bodyKey?: string;
	itemKeys?: string[];
};

const SECTIONS: Section[] = [
	{ headerKey: "legal.privacy.s1Header", bodyKey: "legal.privacy.s1Body" },
	{ bodyKey: "legal.privacy.s2Body" },
	{ bodyKey: "legal.privacy.s3Body" },
	{
		headerKey: "legal.privacy.s4Header",
		subheaderKey: "legal.privacy.s4Subheader",
		bodyKey: "legal.privacy.s4Body",
		itemKeys: ["legal.privacy.s4Item1", "legal.privacy.s4Item2", "legal.privacy.s4Item3", "legal.privacy.s4Item4"],
	},
	{
		subheaderKey: "legal.privacy.s5Subheader",
		bodyKey: "legal.privacy.s5Body",
		itemKeys: [
			"legal.privacy.s5Item1",
			"legal.privacy.s5Item2",
			"legal.privacy.s5Item3",
			"legal.privacy.s5Item4",
			"legal.privacy.s5Item5",
		],
	},
	{ subheaderKey: "legal.privacy.s6Subheader", bodyKey: "legal.privacy.s6Body" },
	{
		headerKey: "legal.privacy.s7Header",
		bodyKey: "legal.privacy.s7Body",
		itemKeys: [
			"legal.privacy.s7Item1",
			"legal.privacy.s7Item2",
			"legal.privacy.s7Item3",
			"legal.privacy.s7Item4",
			"legal.privacy.s7Item5",
			"legal.privacy.s7Item6",
		],
	},
	{ bodyKey: "legal.privacy.s8Body" },
	{ headerKey: "legal.privacy.s9Header", bodyKey: "legal.privacy.s9Body" },
	{
		headerKey: "legal.privacy.s10Header",
		bodyKey: "legal.privacy.s10Body",
		itemKeys: [
			"legal.privacy.s10Item1",
			"legal.privacy.s10Item2",
			"legal.privacy.s10Item3",
			"legal.privacy.s10Item4",
			"legal.privacy.s10Item5",
			"legal.privacy.s10Item6",
			"legal.privacy.s10Item7",
			"legal.privacy.s10Item8",
		],
	},
	{ headerKey: "legal.privacy.s11Header", bodyKey: "legal.privacy.s11Body" },
	{
		headerKey: "legal.privacy.s12Header",
		bodyKey: "legal.privacy.s12Body",
		itemKeys: [
			"legal.privacy.s12Item1",
			"legal.privacy.s12Item2",
			"legal.privacy.s12Item3",
			"legal.privacy.s12Item4",
			"legal.privacy.s12Item5",
		],
	},
	{ headerKey: "legal.privacy.s13Header", bodyKey: "legal.privacy.s13Body" },
	{ headerKey: "legal.privacy.s14Header", bodyKey: "legal.privacy.s14Body" },
	{ headerKey: "legal.privacy.s15Header", bodyKey: "legal.privacy.s15Body" },
	{ headerKey: "legal.privacy.s16Header", bodyKey: "legal.privacy.s16Body" },
	{ headerKey: "legal.privacy.s17Header", bodyKey: "legal.privacy.s17Body" },
];

function sectionKey(s: Section, i: number): string {
	return s.headerKey ?? s.subheaderKey ?? s.bodyKey ?? `section-${i}`;
}

export default function PrivacyPolicy() {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col flex-1 min-h-[100dvh]">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				<div className="mb-10">
					<h1 className="text-2xl font-bold text-[#00ff87] tracking-tight">{t("legal.privacy.title")}</h1>
					<p className="text-lg font-medium text-[#a1a1aa] mt-2">
						{t("legal.privacy.lastModifiedLabel", { date: t("legal.privacy.lastModifiedDate") })}
					</p>
				</div>

				<div className="space-y-6">
					{SECTIONS.map((s, i) => (
						<div
							key={sectionKey(s, i)}
							className={
								s.headerKey ? "bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6" : ""
							}
						>
							{s.headerKey && <h2 className="text-xl font-semibold text-[#00ff87] mb-4">{t(s.headerKey)}</h2>}
							{s.subheaderKey && <h3 className="text-base font-medium text-[#a1a1aa] mb-3">{t(s.subheaderKey)}</h3>}
							{s.bodyKey && <div className="text-sm text-[#a1a1aa] leading-relaxed">{t(s.bodyKey)}</div>}
							{s.itemKeys && (
								<ul className="list-disc list-inside space-y-1 mt-3">
									{s.itemKeys.map((k) => (
										<li key={k} className="text-sm text-[#a1a1aa]">
											{t(k)}
										</li>
									))}
								</ul>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
