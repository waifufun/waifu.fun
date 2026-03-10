import Link from "next/link";
import SmpteBars from "@/components/ui/smpte-bars";

export default function Footer() {
	return (
		<>
			<SmpteBars height={2} />
			<footer className="border-t-2 border-[#00FF87]/30 py-8 text-center text-sm text-gray-500 bg-[#08080A]/70 mt-4">
				<div className="container mx-auto px-4">
					<div className="flex flex-col sm:flex-row justify-between items-center gap-3">
						<p className="uppercase tracking-wider">&copy; {new Date().getFullYear()} waifu.fun</p>
						<div className="flex flex-wrap items-center justify-center md:justify-end gap-4">
							<Link
								href="/privacy-policy"
								className="hover:text-[#00FF87] transition-colors font-bold uppercase tracking-wider"
							>
								Privacy Policy
							</Link>
							<Link
								href="/terms-of-service"
								className="hover:text-[#00FF87] transition-colors font-bold uppercase tracking-wider"
							>
								Terms & Conditions
							</Link>
							<Link href="/fees" className="hover:text-[#00FF87] transition-colors font-bold uppercase tracking-wider">
								Fees
							</Link>
							<Link
								href="/how-it-works"
								className="hover:text-[#00FF87] transition-colors font-bold uppercase tracking-wider"
							>
								FAQ
							</Link>
							<Link href="/support" className="hover:text-[#00FF87] transition-colors font-bold uppercase tracking-wider">
								Support
							</Link>
						</div>
					</div>
				</div>
			</footer>
		</>
	);
}
