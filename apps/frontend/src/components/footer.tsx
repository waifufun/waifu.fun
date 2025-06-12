import Link from "next/link";

export default function Footer() {
	return (
		<footer className="border-t-2 border-[#03FF24]/40 py-8 text-center text-sm text-gray-500 bg-black/70 mt-4">
			<div className="container mx-auto px-4">
				<div className="flex flex-col sm:flex-row justify-between items-center gap-3">
					<p className="uppercase tracking-wider">
						&copy; {new Date().getFullYear()} Auto.fun Network. Engage the Neon.
					</p>
					<div className="flex gap-4">
						<Link href="#" className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider">
							Network Policy
						</Link>
						<Link href="#" className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider">
							Security Matrix
						</Link>
						<Link href="#" className="hover:text-[#03FF24] transition-colors font-bold uppercase tracking-wider">
							System Status
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
