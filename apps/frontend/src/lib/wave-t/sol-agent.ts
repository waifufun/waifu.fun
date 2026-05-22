/**
 * Address of the architect agent (Sol). Live as $WAIFU on BSC since
 * the 2026-05-22 launch. Used by `/agent/sol` vanity redirect and any
 * Sol-specific UX paths.
 */
export const SOL_AGENT_ADDRESS = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";

export function isSolAgentAddress(address: string): boolean {
	return address.toLowerCase() === SOL_AGENT_ADDRESS.toLowerCase();
}
