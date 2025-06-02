import Link from "next/link";
import { Fragment } from "react";

const FOOTER_LINKS = [
	{
		href: "/privacy-policy",
		title: "Privacy Policy",
	},
	{
		href: "/terms-of-service",
		title: "Terms of Service",
	},
	{
		href: "/fees",
		title: "Fees",
	},
	{
		title: `© ${new Date().getFullYear()} auto.fun`,
	},
];

export default function Footer() {
	return (
		<div className="w-full py-3">
			<div className="flex flex-col lg:flex-row items-center flex-wrap justify-center gap-4">
				{FOOTER_LINKS.map((link, _: number) => (
					<Fragment key={link?.href || _}>
						<Link
							aria-disabled={!link?.href}
							href={link?.href ? link.href : "#"}
							className="font-medium text-base text-autofun-text-secondary hover:text-autofun-text-primary transition-all duration-200"
						>
							{link.title}
						</Link>
						<div className="hidden lg:block h-3.5 w-[1px] bg-[#707070]" />
					</Fragment>
				))}
			</div>
		</div>
	);
}
