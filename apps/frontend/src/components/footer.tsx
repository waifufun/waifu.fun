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
			<div className="flex items-center justify-center gap-4">
				{FOOTER_LINKS.map((link, _: number) => (
					<Fragment key={link?.href || _}>
						<Link
							aria-disabled={!link?.href}
							href={link?.href ? link.href : "#"}
							className="font-medium text-base text-autofun-text-secondary hover:text-autofun-text-primary transition-all duration-200"
						>
							{link.title}
						</Link>
						<div className="h-3.5 w-[1px] bg-[#707070]" />
					</Fragment>
				))}
			</div>
		</div>

		// <div className="w-full pb-3 inline-flex flex-col justify-center items-center gap-2.5 overflow-hidden">
		// 	<div className="inline-flex justify-center items-center gap-8">
		// 		<div className="flex justify-start items-center gap-3.5">
		// 			<div className="text-center justify-center text-text-secondary text-base font-medium font-['Satoshi'] leading-normal">
		// 				Privacy Policy
		// 			</div>
		// 			<div className="w-3.5 h-0 origin-top-left -rotate-90 outline-1 outline-offset-[-0.50px] outline-stroke-light" />
		// 			<div className="text-center justify-center text-text-secondary text-base font-medium font-['Satoshi'] leading-normal">
		// 				Terms of Service
		// 			</div>
		// 			<div className="w-3.5 h-0 origin-top-left -rotate-90 outline-1 outline-offset-[-0.50px] outline-stroke-light" />
		// 			<div className="text-center justify-center text-text-secondary text-base font-medium font-['Satoshi'] leading-normal">
		// 				Fees
		// 			</div>
		// 			<div className="w-3.5 h-0 origin-top-left -rotate-90 outline-1 outline-offset-[-0.50px] outline-stroke-light" />
		// 			<div className="text-center justify-center text-text-secondary text-base font-medium font-['Satoshi'] leading-normal">
		// 				© {new Date().getFullYear()} auto.fun
		// 			</div>
		// 		</div>
		// 	</div>
		// </div>
	);
}
