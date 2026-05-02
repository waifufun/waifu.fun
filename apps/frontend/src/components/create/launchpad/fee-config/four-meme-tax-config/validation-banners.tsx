"use client";

import { WarningIcon } from "../../launchpad-icons";

type Props = {
	warnings: string[];
	errors: string[];
};

export function ValidationBanners({ warnings, errors }: Props) {
	return (
		<>
			{warnings.length > 0 ? (
				<section className="border border-amber-500/30 bg-amber-500/[0.04] p-4 flex gap-3" role="alert">
					<WarningIcon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<ul className="text-sm text-amber-200 leading-relaxed space-y-1">
							{warnings.map((w) => (
								<li key={w}>{w}</li>
							))}
						</ul>
					</div>
				</section>
			) : null}

			{errors.length > 0 ? (
				<section className="border border-red-500/30 bg-red-500/[0.04] p-4" role="alert">
					<ul className="text-sm text-red-300 leading-relaxed space-y-1">
						{errors.map((e) => (
							<li key={e}>{e}</li>
						))}
					</ul>
				</section>
			) : null}
		</>
	);
}
