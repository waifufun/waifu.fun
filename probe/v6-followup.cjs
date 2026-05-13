// Follow-up probe to fix:
//   EXP 4: bad address checksum on commissionReceiver constant
//   EXP 6: nonce collision between previous run's pre-funded wallets and trader
// Also re-verifies the EXP2 beneficiary != msg.sender finding (V2 used to reject it).
//
// Run after anvil is up. Independent of v6-v7-characterization.cjs.

const fs = require("fs");
const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const ZERO = ethers.ZeroAddress;

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

const PORTAL_ABI = [
  "function version() view returns (string)",
  "function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
  "function getTokenV8(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId) state)",
];

const TOKEN_V3_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function taxProcessor() view returns (address)",
  "function buyTaxRate() view returns (uint16)",
  "function sellTaxRate() view returns (uint16)",
];

const PROCESSOR_ABI = [
  "function commissionReceiver() view returns (address)",
  "function commissionBps() view returns (uint16)",
  "function commissionQuoteBalance() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function dispatch()",
];

const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const ROUTER_ABI = [
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
];

function cloneInitCode(impl) {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
function predict(salt) {
  return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL)));
}
function mineSalt(label) {
  let salt = ethers.keccak256(ethers.toUtf8Bytes(`v7probe-followup ${label} ${Date.now()} ${Math.random()}`));
  let it = 0;
  while (!predict(salt).toLowerCase().endsWith("7777")) {
    salt = ethers.keccak256(salt);
    it += 1;
  }
  return { salt, predicted: predict(salt), iterations: it };
}
async function setBal(addr, bnb = 1000) {
  const hex = "0x" + (BigInt(bnb) * 10n ** 18n).toString(16);
  await provider.send("anvil_setBalance", [addr, hex]);
}
async function setNonce(addr, n) {
  // anvil_setNonce
  try {
    await provider.send("anvil_setNonce", [addr, "0x" + n.toString(16)]);
  } catch (_) {}
}

function v6P({ name, symbol, beneficiary, commissionReceiver, quoteAmt, salt, buyTax = 1000, sellTax = 1000 }) {
  return {
    name,
    symbol,
    meta: "bafkreifollow1QmTestQmTestQmTestQmTestQmTestQm",
    dexThresh: 1,
    salt,
    migratorType: 1,
    quoteToken: ZERO,
    quoteAmt,
    beneficiary,
    permitData: "0x",
    extensionID: ethers.ZeroHash,
    extensionData: "0x",
    dexId: 0,
    lpFeeProfile: 0,
    buyTaxRate: buyTax,
    sellTaxRate: sellTax,
    taxDuration: BigInt(365 * 86400),
    antiFarmerDuration: BigInt(86400),
    mktBps: 10000,
    deflationBps: 0,
    dividendBps: 0,
    lpBps: 0,
    minimumShareBalance: 0n,
    dividendToken: ZERO,
    commissionReceiver,
    tokenVersion: 6,
  };
}

async function callV6(signer, params, value) {
  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, signer);
  try {
    const tx = await portal.newTokenV6(params, { value, gasLimit: 22_000_000 });
    const r = await tx.wait();
    return { ok: true, receipt: r };
  } catch (err) {
    const ed = err.data || err.info?.error?.data || err.error?.data;
    return { ok: false, ed: typeof ed === "string" ? ed.slice(0, 10) : null, msg: err.shortMessage || err.message };
  }
}

async function readProcessor(tokenAddr) {
  const tk = new ethers.Contract(tokenAddr, TOKEN_V3_ABI, provider);
  const procAddr = await tk.taxProcessor();
  const proc = new ethers.Contract(procAddr, PROCESSOR_ABI, provider);
  return {
    proc,
    procAddr,
    info: {
      address: procAddr,
      commissionReceiver: await proc.commissionReceiver(),
      commissionBps: Number(await proc.commissionBps()),
      commissionQuoteBalance: (await proc.commissionQuoteBalance()).toString(),
      feeReceiver: await proc.feeReceiver(),
    },
  };
}

async function main() {
  // Use fresh wallets entirely (mnemonic-derived from a random seed each run)
  const baseSeed = ethers.hexlify(ethers.randomBytes(32));
  const launcher = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("launcher")])).slice(0, 66), provider);
  const traderRaw = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("trader")])).slice(0, 66), provider);
  // Wrap trader in NonceManager — back-to-back tx without waiting for chain to confirm
  // hits anvil's mempool faster than the JSON-RPC nonce poll updates.
  const trader = new ethers.NonceManager(traderRaw);
  trader.address = traderRaw.address;
  const commissionRecv = ethers.getAddress("0x" + "c0".repeat(20));
  const beneficiaryDistinct = ethers.getAddress("0x" + "b0".repeat(20));

  await setBal(launcher.address);
  await setBal(trader.address);

  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, provider);
  const factory = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, provider);
  console.log(`portal=${PORTAL} version=${await portal.version()} block=${await provider.getBlockNumber()}`);
  console.log(`launcher=${launcher.address} trader=${trader.address}`);
  console.log(`commissionReceiver(test) = ${commissionRecv}`);
  console.log(`distinct beneficiary(test) = ${beneficiaryDistinct}`);

  const out = {};

  // EXP 4 (re-run): V6 mid-curve launch with distinct third-party commissionReceiver
  console.log("\n=== EXP 4r: V6 quoteAmt=0.5, commissionReceiver = distinct third-party address ===");
  const m4 = mineSalt("E4r");
  const p4 = v6P({ name: "Probe E4r", symbol: "PE4R", beneficiary: launcher.address, commissionReceiver: commissionRecv, quoteAmt: ethers.parseEther("0.5"), salt: m4.salt });
  const r4 = await callV6(launcher, p4, ethers.parseEther("0.5"));
  out.exp4r = { ok: r4.ok, gas: r4.receipt?.gasUsed?.toString(), token: m4.predicted, err: r4.ed, msg: r4.msg };
  console.log(`E4r ok=${r4.ok} gas=${r4.receipt?.gasUsed?.toString()} err=${r4.ed} msg=${r4.msg?.slice(0, 140) || ""}`);
  if (r4.ok) {
    const proc = await readProcessor(m4.predicted);
    out.exp4r.processor = proc.info;
    console.log(`E4r processor=${proc.info.address} commissionReceiver=${proc.info.commissionReceiver} commissionBps=${proc.info.commissionBps} feeReceiver=${proc.info.feeReceiver}`);
    const matches = proc.info.commissionReceiver.toLowerCase() === commissionRecv.toLowerCase();
    out.exp4r.commissionMatches = matches;
    console.log(`E4r commissionReceiver matches param: ${matches}`);
  }

  // EXP 6 (re-run): full tax stream end-to-end with graduated token and distinct commissionReceiver
  console.log("\n=== EXP 6r: full tax stream → distinct commissionReceiver vs Flap feeReceiver ===");
  // bump time past cooldown for launcher
  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  // graduate via 20 BNB launch on a fresh launcher EOA (avoid cooldown on `launcher`)
  const launcher2 = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("launcher2")])).slice(0, 66), provider);
  await setBal(launcher2.address);
  const m6 = mineSalt("E6r");
  const p6 = v6P({ name: "Probe E6r", symbol: "PE6R", beneficiary: launcher2.address, commissionReceiver: commissionRecv, quoteAmt: ethers.parseEther("20"), salt: m6.salt });
  const r6 = await callV6(launcher2, p6, ethers.parseEther("20"));
  out.exp6r = { create: { ok: r6.ok, gas: r6.receipt?.gasUsed?.toString(), token: m6.predicted, err: r6.ed, msg: r6.msg } };
  console.log(`E6r create ok=${r6.ok} gas=${r6.receipt?.gasUsed?.toString()} err=${r6.ed} msg=${r6.msg?.slice(0, 140) || ""}`);
  if (!r6.ok) {
    fs.writeFileSync(__dirname + "/v6-followup.json", JSON.stringify(out, null, 2));
    return;
  }
  const state6 = await portal.getTokenV8(m6.predicted);
  out.exp6r.state = { status: state6.status?.toString(), pool: state6.pool, progress: state6.progress?.toString() };
  console.log(`E6r state status=${state6.status} pool=${state6.pool} progress=${state6.progress}`);
  const pair = await factory.getPair(m6.predicted, WBNB);
  console.log(`E6r factoryPair=${pair}`);
  out.exp6r.pair = pair;

  const procInfo = await readProcessor(m6.predicted);
  out.exp6r.processorBefore = procInfo.info;
  console.log(`E6r processor before: ${JSON.stringify(procInfo.info)}`);

  const commissionBefore = await provider.getBalance(commissionRecv);
  const feeBefore = await provider.getBalance(procInfo.info.feeReceiver);

  // swap via PCS V2 router
  const router = new ethers.Contract(PCS_ROUTER, ROUTER_ABI, trader);
  const tk = new ethers.Contract(m6.predicted, TOKEN_V3_ABI, trader);
  try {
    const buy = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, m6.predicted], trader.address, 99999999999n, { value: ethers.parseEther("0.5"), gasLimit: 3_000_000 });
    const buyR = await buy.wait();
    console.log(`E6r buy gas=${buyR.gasUsed}`);
    const bal = await tk.balanceOf(trader.address);
    console.log(`E6r trader bal=${ethers.formatEther(bal)}`);
    const sellAmt = bal / 2n;
    await (await tk.approve(PCS_ROUTER, sellAmt)).wait();
    const sell = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(sellAmt, 0, [m6.predicted, WBNB], trader.address, 99999999999n, { gasLimit: 3_500_000 });
    const sellR = await sell.wait();
    console.log(`E6r sell gas=${sellR.gasUsed}`);
    const pendingPre = await procInfo.proc.commissionQuoteBalance().catch(() => null);
    console.log(`E6r pending pre dispatch=${pendingPre}`);
    const dispatch = await procInfo.proc.connect(trader).dispatch({ gasLimit: 3_000_000 });
    const dispR = await dispatch.wait();
    const commissionAfter = await provider.getBalance(commissionRecv);
    const feeAfter = await provider.getBalance(procInfo.info.feeReceiver);
    const cDelta = commissionAfter - commissionBefore;
    const fDelta = feeAfter - feeBefore;
    const pendingPost = await procInfo.proc.commissionQuoteBalance().catch(() => null);
    console.log(`E6r dispatch gas=${dispR.gasUsed}`);
    console.log(`E6r commissionReceiver delta=${ethers.formatEther(cDelta)} BNB`);
    console.log(`E6r feeReceiver delta=${ethers.formatEther(fDelta)} BNB`);
    console.log(`E6r pending post=${pendingPost}`);
    out.exp6r.commissionDelta = cDelta.toString();
    out.exp6r.feeReceiverDelta = fDelta.toString();
    out.exp6r.dispatchGas = dispR.gasUsed?.toString();
    out.exp6r.pendingPost = pendingPost?.toString() || null;
    out.exp6r.commissionFlowedToCustom = cDelta > 0n;
  } catch (e) {
    console.log(`E6r failed: ${e.shortMessage || e.message}`);
    out.exp6r.error = e.shortMessage || e.message;
  }

  fs.writeFileSync(__dirname + "/v6-followup.json", JSON.stringify(out, null, 2));
  console.log("\nwrote v6-followup.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
