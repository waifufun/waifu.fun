export function normalizeAddress(address: string): string {
	return address.trim().toLowerCase();
}

export function sameAddress(left: string, right: string): boolean {
	return normalizeAddress(left) === normalizeAddress(right);
}
