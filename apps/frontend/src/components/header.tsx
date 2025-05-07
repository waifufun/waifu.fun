import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function Header() {
	return (
		<div className="p-4 flex items-center gap-4 justify-between">
			<Link href="/">Logo</Link>
			<div className="flex items-center gap-4">
				<Input placeholder="Search..." />
				<Button variant="outline">Create</Button>
				<Button>Connect</Button>
			</div>
		</div>
	);
}
