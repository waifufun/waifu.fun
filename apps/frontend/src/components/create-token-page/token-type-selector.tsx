import Link from "next/link";

export default function TokenTypeSelector({ selected }: { selected: "auto" | "manual" | "import" }) {
	const HeaderRow = ({ name, href }: { name: string; href: string }) => {
		return (
			<Link className="w-full" href={href}>
				<button
					type="button"
					className="w-full uppercase hover:cursor-pointer py-4"
					style={{
						background: (selected === name && "linear-gradient(180deg, #171717 0%, #121212 100%)") || "#3333331A",
						borderBottom: selected === name ? "1px solid #03FF24" : "1px solid #262626",
					}}
				>
					<p
						className="text-xl uppercase"
						style={{
							color: selected === name ? "#FFFFFF" : "#626262",
							fontWeight: selected === name ? 700 : 400,
						}}
					>
						{name}
					</p>
				</button>
			</Link>
		);
	};

	return (
		<div className="w-full">
			<div className="flex w-full">
				<HeaderRow href="/create" name="auto" />
				<HeaderRow href="/create/manual" name="manual" />
				<HeaderRow href="/create/import" name="import" />
			</div>
		</div>
	);
}
