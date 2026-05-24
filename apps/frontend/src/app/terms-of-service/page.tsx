"use client";

import { useTranslation } from "@/contexts/locale-context";

// REVIEW LEGAL: this entire page is consequential legal text.
// Every key under legal.terms.* in en.json and zh.json needs a human legal
// reviewer (preferably someone familiar with both English-language ToS
// drafting conventions and zh legal translation conventions). The all-caps
// emphasis clauses (s2Body, s3Body, s17Body, s19Body, s26Body) preserve
// the source convention in both languages; whether to keep all-caps or
// follow a different zh emphasis convention is a question for the human
// reviewer.
//
// Server-side metadata stays in layout.tsx (en-only for now). The body is
// now client-rendered to enable i18n.

type Section = {
	headerKey?: string;
	bodyKey?: string;
	itemKeys?: string[];
};

const SECTIONS: Section[] = [
	{ headerKey: "legal.terms.s1Header", bodyKey: "legal.terms.s1Body" },
	{ bodyKey: "legal.terms.s2Body" },
	{ bodyKey: "legal.terms.s3Body" },
	{ headerKey: "legal.terms.s4Header", bodyKey: "legal.terms.s4Body" },
	{ headerKey: "legal.terms.s5Header", bodyKey: "legal.terms.s5Body" },
	{ headerKey: "legal.terms.s6Header", bodyKey: "legal.terms.s6Body" },
	{ headerKey: "legal.terms.s7Header", bodyKey: "legal.terms.s7Body" },
	{
		itemKeys: [
			"legal.terms.s8Item1",
			"legal.terms.s8Item2",
			"legal.terms.s8Item3",
			"legal.terms.s8Item4",
			"legal.terms.s8Item5",
		],
	},
	{ bodyKey: "legal.terms.s9Body" },
	{ headerKey: "legal.terms.s10Header", bodyKey: "legal.terms.s10Body" },
	{ headerKey: "legal.terms.s11Header", bodyKey: "legal.terms.s11Body" },
	{ headerKey: "legal.terms.s12Header", bodyKey: "legal.terms.s12Body" },
	{ headerKey: "legal.terms.s13Header", bodyKey: "legal.terms.s13Body" },
	{
		itemKeys: [
			"legal.terms.s14Item1",
			"legal.terms.s14Item2",
			"legal.terms.s14Item3",
			"legal.terms.s14Item4",
			"legal.terms.s14Item5",
			"legal.terms.s14Item6",
			"legal.terms.s14Item7",
			"legal.terms.s14Item8",
			"legal.terms.s14Item9",
			"legal.terms.s14Item10",
		],
	},
	{ headerKey: "legal.terms.s15Header", bodyKey: "legal.terms.s15Body" },
	{ headerKey: "legal.terms.s16Header", bodyKey: "legal.terms.s16Body" },
	{ headerKey: "legal.terms.s17Header", bodyKey: "legal.terms.s17Body" },
	{ headerKey: "legal.terms.s18Header", bodyKey: "legal.terms.s18Body" },
	{ headerKey: "legal.terms.s19Header", bodyKey: "legal.terms.s19Body" },
	{ headerKey: "legal.terms.s20Header", bodyKey: "legal.terms.s20Body" },
	{ headerKey: "legal.terms.s21Header", bodyKey: "legal.terms.s21Body" },
	{ headerKey: "legal.terms.s22Header", bodyKey: "legal.terms.s22Body" },
	{ headerKey: "legal.terms.s23Header", bodyKey: "legal.terms.s23Body" },
	{ headerKey: "legal.terms.s24Header", bodyKey: "legal.terms.s24Body" },
	{ headerKey: "legal.terms.s25Header", bodyKey: "legal.terms.s25Body" },
	{ headerKey: "legal.terms.s26Header", bodyKey: "legal.terms.s26Body" },
	{ headerKey: "legal.terms.s27Header", bodyKey: "legal.terms.s27Body" },
	{ headerKey: "legal.terms.s28Header", bodyKey: "legal.terms.s28Body" },
	{ headerKey: "legal.terms.s29Header", bodyKey: "legal.terms.s29Body" },
	{ headerKey: "legal.terms.s30Header", bodyKey: "legal.terms.s30Body" },
];

function sectionKey(s: Section, i: number): string {
	return s.headerKey ?? s.bodyKey ?? s.itemKeys?.[0] ?? `section-${i}`;
}

export default function TermsOfService() {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col flex-1 min-h-[100dvh]">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				<div className="mb-10">
					<h1 className="text-2xl font-bold text-[#00ff87] tracking-tight">{t("legal.terms.title")}</h1>
					<p className="text-lg font-medium text-[#a1a1aa] mt-2">
						{t("legal.terms.lastModifiedLabel", { date: t("legal.terms.lastModifiedDate") })}
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
							{s.bodyKey && <div className="text-sm text-[#a1a1aa] leading-relaxed">{t(s.bodyKey)}</div>}
							{s.itemKeys && (
								<ul className="list-disc list-inside space-y-2">
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
