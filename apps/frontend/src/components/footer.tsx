import Link from "next/link";

export default function Footer() {
	return (
		<footer className="border-t-2 border-[#03FF24]/40 py-8 text-center text-sm text-gray-500 bg-black/70 mt-4">
			<div className="container mx-auto px-4">
				<div className="flex flex-col sm:flex-row justify-between items-center gap-3">
					<p className="uppercase tracking-wider">
						&copy; {new Date().getFullYear()} auto.fun. Engage the Neon.
					</p>
					<div className="flex flex-wrap items-center justify-center md:justify-end gap-4">
						<Link
							href="/privacy-policy"
							className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider"
						>
							Privacy Policy
						</Link>
						<Link
							href="/terms-of-service"
							className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider"
						>
							Terms & Conditions
						</Link>
						<Link href="/fees" className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider">
							Fees
						</Link>
						<Link href="/how-it-works" className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider">
							How it works
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
