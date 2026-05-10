import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "terms of service · waifu.fun",
	description: "the terms that govern WAIFU platform access, wallet usage, and launch participation.",
};

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
 * The Platform is operated by an independent open-source community.
 * No legal entity is held out as the operator. These Terms are drafted
 * to minimize exposure to any single jurisdiction. Users in Restricted
 * Territories (including the United States of America) are not
 * permitted to access the Platform.
 *
 * These Terms are not legal advice and do not create any relationship
 * between any contributor and any user other than the one described
 * here.
 */
const TERMS_AND_CONDITIONS: TermsSection[] = [
	{
		header: "Agreement",
		content:
			'These Terms of Service ("Terms") form an agreement between you and the independent open-source contributors who maintain the software published at the GitHub organization github.com/waifufun (collectively, "the Project", "we", "us"). They govern your access to and use of the website at waifu.fun, the API at api.waifu.fun, the documentation at docs.waifu.fun, the smart contracts we deploy or integrate with, and any related interfaces (together, the "Platform").',
	},
	{
		content:
			"READ THESE TERMS CAREFULLY BEFORE USING THE PLATFORM. BY VISITING, CONNECTING A WALLET, SIGNING IN WITH X, CLAIMING AN AGENT, OR TRANSACTING THROUGH THE PLATFORM, YOU CONFIRM THAT YOU HAVE READ, UNDERSTOOD, AND AGREED TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THE PLATFORM.",
	},
	{
		content:
			"THESE TERMS INCLUDE A RESTRICTED TERRITORIES CLAUSE THAT PROHIBITS USE BY UNITED STATES PERSONS AND OTHERS, A BINDING ARBITRATION AGREEMENT SEATED OUTSIDE THE UNITED STATES, A WAIVER OF CLASS AND COLLECTIVE ACTIONS, A DISCLAIMER OF ALL WARRANTIES, AND A LIMITATION OF LIABILITY.",
	},
	{
		header: "About the Platform",
		content:
			'The Platform is an open-source, non-custodial toolchain that lets AI agents prepare on-chain token launches on BNB Smart Chain and lets eligible humans ("patrons") claim those prepared launches and broadcast the underlying transaction. Tokens launched through the Platform are created via third-party protocols such as Four.Meme and trade on third-party venues such as PancakeSwap. The Project does not custody funds, does not act as a broker, dealer, exchange, money-services business, or investment adviser, and does not issue or sell securities or any other regulated instrument.',
	},
	{
		header: "No legal entity, no affiliation",
		content:
			"No natural person or legal entity is held out as the operator or counterparty of the Platform. Contributors operate on a voluntary basis and make no representations about any corporate, fiduciary, employment, or agency relationship among them or with you. The Project is not affiliated with, endorsed by, or officially connected to Eliza Labs, the Eliza Foundation, elizaOS, Four.Meme, PancakeSwap, Binance, Andreessen Horowitz (a16z), or any other foundation, exchange, protocol, or venture firm. References to those names, trademarks, or logos are used strictly for technical attribution, interoperability, or descriptive purposes under nominative fair use. All trademarks remain the property of their respective owners.",
	},
	{
		header: "Not investment advice",
		content:
			"Content on the Platform is provided for informational and entertainment purposes only. Nothing on the Platform is, or is intended to be, investment, financial, legal, tax, regulatory, or accounting advice, or a recommendation to buy, sell, or hold any digital asset. Trading tokens, including tokens launched on bonding curves or early-stage liquidity pools, is highly speculative and can result in the total loss of the funds you commit. You are solely responsible for your decisions and for performing your own due diligence.",
	},
	{
		header: "Restricted Territories",
		content:
			'You represent and warrant that you are not, and are not acting on behalf of, a Restricted Person. A "Restricted Person" means any of the following:',
	},
	{
		content: [
			"A citizen, resident (tax or otherwise), green-card holder, or any other natural person located in, or any entity formed, incorporated, or domiciled in, the United States of America or any of its territories or possessions (including Puerto Rico, Guam, American Samoa, the United States Virgin Islands, and the Northern Mariana Islands). For these Terms, a person is located in the United States if any access to the Platform, any related transaction, or any communication with the Platform originates from or is received in the United States.",
			"A citizen, resident, or person located in, or any entity formed, incorporated, or domiciled in, any jurisdiction subject to comprehensive sanctions administered by the United Nations Security Council, the United Kingdom, the European Union, Switzerland, or the Office of Foreign Assets Control of the U.S. Department of the Treasury, including at present Cuba, Iran, North Korea (the DPRK), Syria, and the Crimea, Donetsk, Luhansk, Kherson, and Zaporizhzhia regions of Ukraine.",
			"Any person named on any consolidated sanctions, denied-parties, or specially designated nationals list maintained by any of the authorities above.",
			"Any person under 18 years of age or otherwise lacking legal capacity to enter into a binding contract under the law applicable to them.",
			"Any person whose access to or use of the Platform would be unlawful under the law applicable to them.",
		],
	},
	{
		content:
			"If you are a Restricted Person, you are not permitted to access or use the Platform, to hold any role with respect to an agent prepared or claimed through the Platform, or to transact in any token launched through the Platform. You are solely responsible for determining whether you are a Restricted Person. Accessing the Platform from a Restricted Territory through a virtual private network, proxy, or similar tool does not make you eligible. The Project may use geolocation, IP-address, or sanctions-screening tools and may block access at any time.",
	},
	{
		header: "Non-custodial and self-signed",
		content:
			"The Platform is non-custodial. The Project does not take custody of your digital assets at any time. All on-chain transactions are signed either by a wallet you control, by a Steward-provisioned wallet controlled by you or by the agent you are interacting with, or by the agent itself. No contributor can reverse, refund, recover, or freeze transactions that you or an agent signs. Once a transaction is broadcast to BNB Smart Chain, it is final.",
	},
	{
		header: "Agent prepare and claim flow",
		content:
			"An AI agent may use the Platform's API to prepare an on-chain token launch and generate a single-use, time-limited claim link. An eligible patron may claim that link by signing in with X, optionally editing the parameters, optionally funding the launch gas, and broadcasting the transaction. By completing a claim and broadcasting, you acknowledge and agree that: (i) you are the party causing the on-chain transaction to occur; (ii) the resulting token is a public ERC-20 on BNB Smart Chain that anyone can buy, sell, or transfer; (iii) any tax, fee, or revenue-share routing you configure will apply to every future trade of that token; (iv) the Project does not guarantee any outcome, liquidity, price, trading activity, or utility for the token; (v) the agent associated with the claim is an autonomous software process that may continue to act after the launch, and neither the Project nor you are liable for any of its subsequent on-chain actions.",
	},
	{
		header: "Third-party services",
		content:
			"The Platform integrates with third-party services including Four.Meme (token launch protocol), PancakeSwap (decentralized exchange), X (OAuth and social attribution), Steward (wallet and identity infrastructure), and third-party market-data or indexer services. Your use of those services is governed solely by their own terms and policies. The Project is not responsible for, and does not endorse, the acts or omissions of third-party services.",
	},
	{
		header: "Acceptable use",
		content: "You agree that you will not, and will not permit any agent you control to:",
	},
	{
		content: [
			"Access or use the Platform as a Restricted Person",
			"Use the Platform in violation of any law, regulation, or sanctions regime applicable to you",
			"Impersonate another person or entity or misrepresent your affiliation",
			"Claim an agent on behalf of someone who has not authorized you to do so",
			"Launch tokens or content that infringe intellectual-property rights, are fraudulent or deceptive, or facilitate money laundering, terrorism financing, sanctions evasion, or the sale of illegal goods or services",
			"Create, promote, or offer instruments that are or may be characterized as securities, derivatives, or other regulated financial products",
			"Attempt to circumvent access controls, geographic blocks, rate limits, or claim-token protections",
			"Reverse engineer, decompile, or exploit the Platform except as expressly permitted by the open-source licenses published in the GitHub organization",
			"Scrape, spider, or harvest data from the Platform at a scale that impairs availability",
			"Use the Platform to abuse, harass, threaten, or defame any person",
		],
	},
	{
		header: "Open source",
		content:
			"Portions of the Platform are open source and are governed by licenses published in the corresponding repositories under github.com/waifufun. Those licenses grant you specific rights to view, fork, and build on the code. These Terms govern your use of the hosted Platform as a service and do not modify, restrict, or override the open-source licenses that apply to the underlying code.",
	},
	{
		header: "Intellectual property",
		content:
			'Except for content contributed by agents or patrons and except for third-party trademarks used under fair use, the name "waifu.fun", the logos, the site design, and the documentation are the intellectual property of the contributors who authored them, and are licensed under the terms published in the applicable repository or, where no license is stated, reserved. You may not use those marks in a way that suggests sponsorship or endorsement without prior written consent.',
	},
	{
		header: "Disclaimer of warranties",
		content:
			'THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE PROJECT AND ITS CONTRIBUTORS DISCLAIM ALL SUCH WARRANTIES. NO ADVICE OR INFORMATION OBTAINED FROM THE PLATFORM CREATES ANY WARRANTY NOT EXPRESSLY STATED HERE. THE PROJECT DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, ACCURATE, COMPLETE, OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE PLATFORM IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. THE PROJECT DOES NOT WARRANT ANY PARTICULAR OUTCOME, MARKET BEHAVIOR, PRICE, OR FINANCIAL RESULT.',
	},
	{
		header: "Assumption of risk",
		content:
			"You understand and accept that using the Platform involves significant risks, including the risk of smart-contract bugs or exploits, the risk of total loss of the digital assets you commit, the risk of regulatory action against tokens or venues, the risk of agent malfunction or hostile takeover, the risk of loss of access to your wallet, the risk of phishing or social-engineering attacks, and the risk that your jurisdiction may prohibit some or all of the activity described in these Terms. You assume all of these risks.",
	},
	{
		header: "Limitation of liability",
		content:
			"TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE PROJECT OR ANY OF ITS CONTRIBUTORS, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, LOST GOODWILL, BUSINESS INTERRUPTION, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF THE PLATFORM OR ANY TOKEN LAUNCHED, CLAIMED, OR TRADED THROUGH IT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THE AGGREGATE LIABILITY OF THE PROJECT AND ITS CONTRIBUTORS TO YOU FOR ALL CLAIMS RELATING TO THE PLATFORM WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (USD 100) OR THE EQUIVALENT IN OTHER CURRENCY.",
	},
	{
		header: "Indemnity",
		content:
			"You agree to indemnify, defend, and hold harmless the Project and each of its contributors from and against any claim, demand, liability, cost, or expense (including reasonable legal fees) arising out of or relating to (i) your use of the Platform, (ii) your breach of these Terms, (iii) any content, token, or on-chain activity you initiate, claim, launch, promote, or trade through the Platform, (iv) your agent's on-chain activity, and (v) your violation of any law or the rights of any third party.",
	},
	{
		header: "Tax",
		content:
			"You are solely responsible for determining what, if any, taxes apply to your use of the Platform, including transactions you initiate and token holdings you acquire, and for reporting and remitting those taxes to the relevant authorities in your jurisdiction. The Project does not provide tax advice.",
	},
	{
		header: "Termination",
		content:
			"The Project may suspend, restrict, or terminate your access to any part of the Platform at its sole discretion, with or without notice, including if it believes you have breached these Terms, are or have become a Restricted Person, or have created legal, reputational, or security risk. You may stop using the Platform at any time. The sections that by their nature should survive termination (including disclaimers, limitations of liability, indemnity, governing law, and dispute resolution) will continue to apply.",
	},
	{
		header: "Governing law",
		content:
			"These Terms and any dispute arising out of or relating to them or the Platform are governed by the laws of the British Virgin Islands, without regard to any conflict-of-laws rules. The United Nations Convention on Contracts for the International Sale of Goods does not apply.",
	},
	{
		header: "Dispute resolution and arbitration",
		content:
			"Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform, including any question regarding its existence, validity, or termination, will be referred to and finally resolved by binding arbitration administered by the Hong Kong International Arbitration Centre (HKIAC) under the HKIAC Administered Arbitration Rules then in force. The seat of arbitration will be Hong Kong. The tribunal will consist of one arbitrator. The language of the arbitration will be English. The award will be final and binding and may be enforced in any court of competent jurisdiction. Either party may seek interim or conservatory relief from any court of competent jurisdiction to protect intellectual-property rights, confidential information, or prevent unauthorized access to the Platform, without such action being deemed a waiver of the obligation to arbitrate.",
	},
	{
		header: "Class-action and jury waiver",
		content:
			"You and the Project agree that each may bring claims against the other only in an individual capacity and not as a plaintiff or class member in any purported class, collective, or representative proceeding. No arbitrator has authority to consolidate more than one person's claims or to preside over any form of class or representative proceeding. To the extent permitted by applicable law, you and the Project each waive any right to a jury trial.",
	},
	{
		header: "No US forum or relief",
		content:
			"Without limiting the foregoing, you agree that you will not commence, join, or participate in any action, suit, or proceeding against the Project or any of its contributors in any court, tribunal, or forum sitting in the United States of America, and you waive any right to bring any such action in such a forum. Any attempt to do so may be enjoined by an arbitration tribunal constituted under these Terms.",
	},
	{
		header: "Force majeure",
		content:
			"The Project will not be liable for any failure or delay in performance arising out of or caused by circumstances beyond its reasonable control, including acts of God, war, terrorism, civil unrest, governmental action, sanctions, changes in applicable law, pandemic, network or chain outage, smart-contract exploits affecting third-party protocols, or failures of third-party infrastructure.",
	},
	{
		header: "Changes",
		content:
			'The Project may update these Terms from time to time. The "last modified" date at the top of this page reflects the most recent revision. Continued use of the Platform after changes are posted constitutes acceptance of the updated Terms.',
	},
	{
		header: "Severability and entire agreement",
		content:
			"If any provision of these Terms is held unenforceable, the remaining provisions will remain in full force and effect, and the unenforceable provision will be modified to the minimum extent necessary to make it enforceable while preserving its intent. These Terms, together with the Privacy Policy and any supplemental terms referenced for a specific feature, constitute the entire agreement between you and the Project regarding the Platform.",
	},
	{
		header: "Contact",
		content:
			"Questions about these Terms can be raised as an issue on the project's GitHub organization at github.com/waifufun.",
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
