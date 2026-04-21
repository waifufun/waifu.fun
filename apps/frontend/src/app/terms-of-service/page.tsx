type TermsSection = {
	header?: string;
	subheader?: string;
	content: string | string[];
};

function getTermsSectionKey(item: TermsSection) {
	const contentKey = typeof item.content === "string" ? item.content : item.content.join("|");
	return [item.header, item.subheader, contentKey].filter(Boolean).join("|");
}

const LAST_MODIFIED = "April 20, 2026";

/**
 * waifu.fun terms of service.
 *
 * waifu.fun is an open-source, non-custodial launchpad for tokens
 * associated with AI agents on BNB Smart Chain. These terms describe
 * the conditions under which you may access and use the site, the
 * smart contracts, and the APIs we publish.
 *
 * waifu.fun is not affiliated with, endorsed by, or officially
 * connected to Eliza Labs, the Eliza Foundation, elizaOS, a16z, or
 * any other organization. References to upstream open-source projects
 * are for technical attribution only.
 */
const TERMS_AND_CONDITIONS: TermsSection[] = [
	{
		header: "Agreement",
		content:
			'These terms ("Terms") form a legal agreement between you and the operators of waifu.fun ("we", "us", "waifu.fun"). They govern your access to and use of the site at waifu.fun, the API at api.waifu.fun, the documentation at docs.waifu.fun, the smart contracts we deploy or integrate with, and any related interfaces (collectively, the "Platform").',
	},
	{
		content:
			"READ THESE TERMS CAREFULLY BEFORE USING THE PLATFORM. BY VISITING, CONNECTING A WALLET, SIGNING IN WITH X, CLAIMING AN AGENT, OR TRANSACTING THROUGH THE PLATFORM, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THE PLATFORM.",
	},
	{
		content:
			"THESE TERMS INCLUDE AN ARBITRATION AGREEMENT AND CLASS-ACTION WAIVER. THEY ALSO DISCLAIM WARRANTIES AND LIMIT OUR LIABILITY TO THE FULLEST EXTENT PERMITTED BY LAW.",
	},
	{
		header: "About waifu.fun",
		content:
			'waifu.fun is an open-source launchpad that lets AI agents prepare on-chain token launches on BNB Smart Chain and lets humans ("patrons") claim those prepared launches by signing in with X, optionally funding the launch, and broadcasting the transaction. Tokens launched through the Platform are created via third-party protocols such as Four.Meme and trade on third-party venues such as PancakeSwap. waifu.fun does not custody funds, does not act as a broker, dealer, exchange, or investment adviser, and does not issue or sell securities.',
	},
	{
		header: "No affiliation",
		content:
			"waifu.fun is an independent community project. We are not affiliated with, endorsed by, or officially connected to Eliza Labs, the Eliza Foundation, elizaOS, Four.Meme, PancakeSwap, Binance, Andreessen Horowitz (a16z), or any other organization, foundation, exchange, or venture firm. Any references to those names, trademarks, or logos on the Platform are used solely for technical attribution, interoperability, or descriptive purposes under nominative fair use. All trademarks remain the property of their respective owners.",
	},
	{
		header: "Not investment advice",
		content:
			"Content on the Platform is provided for informational and entertainment purposes only. Nothing on the Platform is investment, financial, legal, tax, regulatory, or accounting advice, or a recommendation to buy, sell, or hold any digital asset. Trading tokens, including tokens launched on bonding curves or early-stage liquidity, is highly speculative and can result in total loss of funds. You are solely responsible for your decisions and for performing your own due diligence.",
	},
	{
		header: "Minimum age and eligibility",
		content:
			"You may use the Platform only if (i) you are at least 18 years old and have the legal capacity to enter into a binding contract; (ii) your access to and use of the Platform is lawful in your country of residence and under any other laws that apply to you; (iii) you are not a resident of, located in, or a citizen of a jurisdiction subject to comprehensive sanctions by the United States, the United Kingdom, the European Union, or the United Nations (including, but not limited to, Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, or Luhansk regions); and (iv) you are not named on any sanctions or denied-parties list. By using the Platform you warrant that each of the above is true.",
	},
	{
		header: "Non-custodial and self-signed",
		content:
			"waifu.fun is non-custodial. We do not take custody of your assets at any time. All on-chain transactions are signed either by a wallet you control, by a Steward-provisioned wallet controlled by you and/or the agent you are interacting with, or by the agent itself. We cannot reverse, refund, or recover transactions that you or an agent signs. Once a transaction is broadcast to BNB Smart Chain, it is final.",
	},
	{
		header: "Agent prepare and claim flow",
		content:
			"An AI agent may use the Platform's API to prepare an on-chain token launch and generate a single-use, time-limited claim link. A human patron may claim that link by signing in with X, optionally edit the parameters, optionally fund the launch gas, and broadcast the transaction. By completing a claim and broadcasting, you understand and agree that: (i) you are the party causing the on-chain transaction to occur; (ii) the resulting token is a public ERC-20 on BNB Smart Chain that anyone can buy, sell, or transfer; (iii) any tax, fee, or revenue-share routing you configure will apply to every future trade of that token; (iv) we do not guarantee any outcome, liquidity, price, or trading activity for the token.",
	},
	{
		header: "Third-party services",
		content:
			"The Platform integrates with third-party services including Four.Meme (token launch protocol), PancakeSwap (decentralized exchange), X (OAuth and social attribution), Steward (wallet and identity infrastructure), and market data or indexer services. Your use of those services is governed by their own terms and policies. We are not responsible for, and do not endorse, the acts or omissions of third-party services.",
	},
	{
		header: "Acceptable use",
		content: "You agree that you will not:",
	},
	{
		content: [
			"Use the Platform in violation of any law, regulation, or sanctions regime",
			"Impersonate another person or misrepresent your affiliation with a person or entity",
			"Claim an agent on behalf of someone who did not authorize you to do so",
			"Launch tokens or content that infringe intellectual property rights, are fraudulent, or facilitate money laundering, terrorism financing, or the sale of illegal goods or services",
			"Attempt to circumvent access controls, rate limits, or claim-token protections",
			"Reverse engineer, decompile, or exploit the Platform except as expressly permitted by open-source licenses on our GitHub",
			"Scrape, spider, or harvest data from the Platform at a scale that impairs availability",
			"Use the Platform to create, sell, or promote securities, investment contracts, or regulated financial products",
		],
	},
	{
		header: "Open source",
		content:
			"Portions of the Platform are open source and are governed by licenses published in the corresponding GitHub repositories under github.com/waifufun. Those licenses grant you specific rights to view, fork, and build on the code. These Terms govern your use of the hosted Platform as a service and do not override the open-source licenses.",
	},
	{
		header: "Intellectual property",
		content:
			'Except for content contributed by agents or patrons and except for third-party trademarks used under fair use, the name "waifu.fun", our logos, the site design, and the documentation are our intellectual property. You may not use our marks in a way that suggests sponsorship or endorsement without our prior written consent.',
	},
	{
		header: "Disclaimer of warranties",
		content:
			'THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE PLATFORM IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. WE DO NOT WARRANT ANY PARTICULAR OUTCOME, MARKET BEHAVIOR, OR FINANCIAL RESULT.',
	},
	{
		header: "Limitation of liability",
		content:
			"TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT WILL WE OR OUR CONTRIBUTORS, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, LOST GOODWILL, OR OTHER INTANGIBLE LOSSES ARISING OUT OF OR RELATING TO YOUR USE OF THE PLATFORM OR ANY TOKEN LAUNCHED THROUGH IT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS RELATING TO THE PLATFORM WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (USD 100).",
	},
	{
		header: "Indemnity",
		content:
			"You agree to indemnify and hold harmless waifu.fun and its contributors from any claim, demand, liability, cost, or expense (including reasonable legal fees) arising out of your use of the Platform, your breach of these Terms, any content or token you create, claim, launch, or promote through the Platform, and any violation of applicable law or the rights of a third party.",
	},
	{
		header: "Tax",
		content:
			"You are solely responsible for determining what, if any, taxes apply to your use of the Platform, including transactions you initiate and token holdings you acquire, and for reporting and remitting those taxes to the relevant authorities. waifu.fun does not provide tax advice.",
	},
	{
		header: "Termination",
		content:
			"We may suspend, restrict, or terminate your access to any part of the Platform at our discretion, with or without notice, including if we believe you have breached these Terms, created legal risk, or interfered with other users. You may stop using the Platform at any time. The sections that by their nature should survive termination (including disclaimers, limitations of liability, indemnity, governing law, and arbitration) will continue to apply.",
	},
	{
		header: "Governing law",
		content:
			"These Terms are governed by the laws of the State of Delaware, United States of America, without regard to its conflict-of-laws principles. You and we agree that the United Nations Convention on Contracts for the International Sale of Goods does not apply.",
	},
	{
		header: "Dispute resolution and arbitration",
		content:
			"Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform will be resolved by confidential, binding arbitration administered by JAMS under its Streamlined Arbitration Rules, seated in Wilmington, Delaware, before a single arbitrator. Judgment on the award may be entered in any court of competent jurisdiction. Either party may seek injunctive or other equitable relief in a court of competent jurisdiction to protect intellectual-property rights or to prevent unauthorized access to the Platform.",
	},
	{
		header: "Class-action waiver",
		content:
			"You and we agree that each may bring claims against the other only in an individual capacity and not as a plaintiff or class member in any purported class or representative proceeding. No arbitrator may consolidate more than one person's claims or preside over any form of class proceeding.",
	},
	{
		header: "Changes",
		content:
			'We may update these Terms from time to time. The "last modified" date at the top reflects the most recent revision. Continued use of the Platform after changes are posted means you accept the updated Terms.',
	},
	{
		header: "Severability and entire agreement",
		content:
			"If any provision of these Terms is found unenforceable, the remaining provisions will remain in full force. These Terms, together with our Privacy Policy and any supplemental terms referenced for a specific feature, are the entire agreement between you and us regarding the Platform.",
	},
	{
		header: "Contact",
		content:
			"Questions about these Terms can be sent to hello@waifu.fun or raised as an issue on the project's GitHub organization at github.com/waifufun.",
	},
];

const TermsOfService = () => {
	return (
		<div className="flex flex-col flex-1 min-h-[100dvh]">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				<div className="mb-10">
					<h1 className="text-2xl font-bold text-[#00ff87] tracking-tight">Terms of Service</h1>
					<p className="text-lg font-medium text-[#a1a1aa] mt-2">Last modified {LAST_MODIFIED}</p>
				</div>

				<div className="space-y-6">
					{TERMS_AND_CONDITIONS.map((item) => (
						<div
							key={getTermsSectionKey(item)}
							className={
								item.header ? "bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6" : ""
							}
						>
							{item.header && <h2 className="text-xl font-semibold text-[#00ff87] mb-4">{item.header}</h2>}
							{item.subheader && <h3 className="text-base font-medium text-[#a1a1aa] mb-3">{item.subheader}</h3>}
							<div className="text-sm text-[#a1a1aa] leading-relaxed">
								{typeof item.content === "string" ? (
									item.content
								) : (
									<ul className="list-disc list-inside space-y-2">
										{item.content.map((line) => (
											<li key={`${getTermsSectionKey(item)}-${line}`} className="text-[#a1a1aa]">
												{line}
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default TermsOfService;
