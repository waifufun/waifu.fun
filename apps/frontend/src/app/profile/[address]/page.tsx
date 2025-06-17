import { getAddressBalances } from "@/lib/api";
import type { AddressLike } from "@autofun/types";
import ClientPage from "./components/page";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ address: AddressLike }> }) {
	const { address } = await params;

	try {
		const balances = await getAddressBalances({ address });
		return <ClientPage balances={balances} />;
	} catch (err) {
		notFound();
	}
}
