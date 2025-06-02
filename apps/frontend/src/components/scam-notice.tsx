import { AlertTriangle } from "lucide-react";

export default function ScamWarning({ isHidden }: { isHidden?: boolean }) {
	if (!isHidden) return null;
	return (
		<div className="p-4 flex flex-col bg-[#333333]/10 rounded-lg " role="alert">
			<div className="flex items-center">
				<AlertTriangle className="w-6 h-6 mr-2 flex-shrink-0 text-red-500" />
				<span className="font-semibold text-red-500 tracking-wide">High-Risk Warning</span>
			</div>
			<p className="mt-2 text-sm">
				This token has been flagged as potentially fraudulent or part of a scam. Trading it carries a{" "}
				<strong>very high risk of loss</strong>. Proceed with extreme caution, and make sure to do your own thorough
				research before buying.
			</p>
		</div>
	);
}
