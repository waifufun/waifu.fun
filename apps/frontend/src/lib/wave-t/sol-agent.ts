/**
 * Address of the architect agent (Sol → $WAIFU).
 *
 * Re-exported under the legacy `SOL_AGENT_ADDRESS` name for one cycle so
 * older callsites compile; new code should import `ARCHITECT_AGENT_ADDRESS`
 * from `architect-agent.ts` directly.
 *
 * @deprecated Import from `./architect-agent` instead. This shim exists
 * only to keep this rename PR mechanical; remove after one cycle.
 */

export {
	ARCHITECT_AGENT_ADDRESS as SOL_AGENT_ADDRESS,
	isArchitectAgentAddress as isSolAgentAddress,
} from "./architect-agent";
