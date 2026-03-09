import { getAddressBalances } from "@/lib/api";
import type { AddressLike } from "@waifufun/types";
import ClientPage from "./components/page";

export default async function Page({ params }: { params: Promise<{ address: AddressLike }> }) {
	const { address } = await params;

	// getAddressBalances returns a default object if not implemented
	// No need to throw 404 - show empty state instead
	const balances = await getAddressBalances({ address });
	return <ClientPage balances={balances} />;
}
