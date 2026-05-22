/**
 * Address of the architect agent.
 *
 * The constant is named after the role (the architect that builds the
 * waifu.fun platform itself), not the persona that currently fills it.
 * Sol is the first architect and $WAIFU is the first architect token; if
 * the persona changes or the platform onboards a second architect-tier
 * agent, the role survives the rename.
 *
 * Live as $WAIFU on BSC since the 2026-05-22 launch. Used by `/agent/sol`
 * vanity redirect and any architect-specific UX paths. If the persona ever
 * changes or the platform onboards a second architect-tier agent, the role
 * survives the rename and only this constant moves.
 */
export const ARCHITECT_AGENT_ADDRESS = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";

export function isArchitectAgentAddress(address: string): boolean {
	return address.toLowerCase() === ARCHITECT_AGENT_ADDRESS.toLowerCase();
}
