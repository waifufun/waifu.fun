import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
	title: string;
	body?: string;
	ctaLabel?: string;
	ctaHref?: string | null;
};

export default function EmptyState({ title, body, ctaLabel = "Create agent", ctaHref = "/create/wizard" }: Props) {
	return (
		<section
			aria-labelledby="patron-empty-title"
			className="flex flex-col items-center justify-center text-center py-16 px-6 border border-dashed border-stroke-strong rounded-sm bg-[#0C0C0C]"
		>
			<h2 id="patron-empty-title" className="text-lg font-medium text-white mb-2">
				{title}
			</h2>
			{body ? <p className="text-sm text-neutral-400 max-w-md mb-6">{body}</p> : null}
			{ctaHref ? (
				<Link href={ctaHref}>
					<Button variant="outline" className="h-10 px-5">
						{ctaLabel}
					</Button>
				</Link>
			) : null}
		</section>
	);
}
