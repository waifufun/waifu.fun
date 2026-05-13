// V6/V7 characterization: existence, params, commissionReceiver flow,
// cooldown semantics, beneficiary constraint, graduation.
//
// Run after starting anvil:
//   PATH=$HOME/.foundry/bin:$PATH anvil --fork-url "$ALCHEMY_BSC_URL" \
//     --fork-block-number 97368808 --chain-id 56 --host 127.0.0.1 --port 8546 --balance 1000
//
// node probe/v6-v7-characterization.cjs

const fs = require("fs");
const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const ZERO = ethers.ZeroAddress;

// Distinct EOAs (Portal cooldown is per tx.origin, 90s window from prior probe).
const ANVIL_PKS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1505e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
];

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

const PORTAL_ABI = [
  "function version() view returns (string)",
  "function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
  "function newTokenV7((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
  "function getTokenV8(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId) state)",
  "event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)",
  "event TokenBought(uint256 ts,address token,address buyer,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
  "event TokenSold(uint256 ts,address token,address seller,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
  "event LaunchedToDEX(address token,address pool,uint256 amount,uint256 eth)",
  "event FlapTokenProgressChanged(address token,uint256 newProgress)",
  "event FlapTokenAsymmetricTaxSet(address token,uint256 buyTax,uint256 sellTax)",
  "event FlapTokenTaxSet(address token,uint256 tax)",
];

const TOKEN_V3_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function taxProcessor() view returns (address)",
  "function dividendContract() view returns (address)",
  "function buyTaxRate() view returns (uint16)",
  "function sellTaxRate() view returns (uint16)",
  "function liquidationThreshold() view returns (uint256)",
];

const PROCESSOR_ABI = [
  "function commissionReceiver() view returns (address)",
  "function commissionBps() view returns (uint16)",
  "function commissionQuoteBalance() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function dispatch()",
  "function dividendAddress() view returns (address)",
];

const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const ROUTER_ABI = [
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
];

const portalIface = new ethers.Interface(PORTAL_ABI);
const tokenIface = new ethers.Interface(TOKEN_V3_ABI);
const processorIface = new ethers.Interface(PROCESSOR_ABI);

function cloneInitCode(impl) {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
function predict(salt) {
  return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL)));
}
function mineSalt(label) {
  let salt = ethers.keccak256(ethers.toUtf8Bytes(`v7probe ${label} ${Date.now()} ${Math.random()}`));
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

function v6P({ name, symbol, beneficiary, commissionReceiver, quoteAmt, salt, buyTax = 300, sellTax = 1000, dexThresh = 1 }) {
  return {
    name,
    symbol,
    meta: "bafkreireal2QmTestQmTestQmTestQmTestQmTestQm",
    dexThresh,
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

async function callV7Raw(signer, params, value) {
  const data = portalIface.encodeFunctionData("newTokenV7", [params]);
  try {
    const tx = await signer.sendTransaction({ to: PORTAL, data, value, gasLimit: 22_000_000 });
    const r = await tx.wait();
    return { ok: true, receipt: r };
  } catch (err) {
    const ed = err.data || err.info?.error?.data || err.error?.data;
    return { ok: false, ed: typeof ed === "string" ? ed.slice(0, 10) : null, msg: err.shortMessage || err.message };
  }
}

function parseLogs(r) {
  const out = [];
  for (const log of r.logs) {
    for (const iface of [portalIface, tokenIface, processorIface]) {
      try {
        const p = iface.parseLog(log);
        out.push({ name: p.name, args: p.args, addr: log.address });
        break;
      } catch (_) {}
    }
  }
  return out;
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
      commissionReceiver: await proc.commissionReceiver().catch(() => "<err>"),
      commissionBps: await proc.commissionBps().then((v) => Number(v)).catch(() => null),
      commissionQuoteBalance: await proc.commissionQuoteBalance().then((v) => v.toString()).catch(() => null),
      feeReceiver: await proc.feeReceiver().catch(() => null),
      dividendAddress: await proc.dividendAddress().catch(() => null),
    },
  };
}

async function main() {
  const out = { fork: { block: await provider.getBlockNumber(), portal: PORTAL, taxV3Impl: TAX_TOKEN_V3_IMPL } };
  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, provider);
  const factory = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, provider);
  out.portalVersion = await portal.version();
  console.log(`portal=${PORTAL} version=${out.portalVersion} forkBlock=${out.fork.block}`);

  // ============ EXP 0: V7 existence ============
  console.log("\n=== EXP 0: newTokenV7 existence ===");
  const w0 = new ethers.Wallet(ANVIL_PKS[0], provider);
  await setBal(w0.address);
  const m0 = mineSalt("V7probe");
  const p0 = v6P({ name: "V7 Probe", symbol: "V7P", beneficiary: w0.address, commissionReceiver: w0.address, quoteAmt: ethers.parseEther("0.01"), salt: m0.salt });
  const v7Raw = await callV7Raw(w0, p0, ethers.parseEther("0.01"));
  const dataV7 = portalIface.encodeFunctionData("newTokenV7", [p0]);
  let v7CallErr = null;
  try {
    await provider.call({ from: w0.address, to: PORTAL, data: dataV7, value: ethers.parseEther("0.01") });
    v7CallErr = "<no revert>";
  } catch (e) {
    const ed = e.data || e.info?.error?.data;
    v7CallErr = ed || "<no data>";
  }
  out.exp0 = { v7TxOk: v7Raw.ok, v7TxErr: v7Raw.ed, v7TxMsg: v7Raw.msg, v7CallData: v7CallErr };
  console.log(`V7 tx ok=${v7Raw.ok} errData=${v7Raw.ed} call errData=${v7CallErr}`);
  out.exp0.v7Exists = !!(v7CallErr && v7CallErr !== "0x" && v7CallErr !== "<no data>" && v7CallErr !== "<no revert>");

  // ============ EXP 1: V6 EOA path, custom commissionReceiver ============
  console.log("\n=== EXP 1: V6 EOA, commissionReceiver=EOA, quoteAmt=0.01 BNB ===");
  const w1 = new ethers.Wallet(ANVIL_PKS[1], provider);
  await setBal(w1.address);
  const m1 = mineSalt("E1");
  const p1 = v6P({ name: "Probe E1", symbol: "PE1", beneficiary: w1.address, commissionReceiver: w1.address, quoteAmt: ethers.parseEther("0.01"), salt: m1.salt });
  const r1 = await callV6(w1, p1, ethers.parseEther("0.01"));
  console.log(`E1 ok=${r1.ok} gas=${r1.receipt?.gasUsed?.toString()} err=${r1.ed} msg=${r1.msg?.slice(0, 140) || ""}`);
  out.exp1 = { ok: r1.ok, gas: r1.receipt?.gasUsed?.toString(), token: m1.predicted };
  if (r1.ok) {
    const state = await portal.getTokenV8(m1.predicted);
    out.exp1.state = {
      status: state.status?.toString(),
      tokenVersion: state.tokenVersion?.toString(),
      reserve: state.reserve?.toString(),
      circ: state.circulatingSupply?.toString(),
      progress: state.progress?.toString(),
      pool: state.pool,
      buyTaxRate: state.buyTaxRate?.toString(),
      sellTaxRate: state.sellTaxRate?.toString(),
      dexSupplyThresh: state.dexSupplyThresh?.toString(),
    };
    console.log(`E1 state status=${state.status} version=${state.tokenVersion} reserve=${ethers.formatEther(state.reserve)} buyTax=${state.buyTaxRate} sellTax=${state.sellTaxRate}`);
    const proc = await readProcessor(m1.predicted);
    out.exp1.processor = proc.info;
    console.log(`E1 processor=${proc.info.address} commissionReceiver=${proc.info.commissionReceiver} commissionBps=${proc.info.commissionBps} feeReceiver=${proc.info.feeReceiver}`);
  }

  // ============ EXP 2: beneficiary != msg.sender (EOA path) ============
  console.log("\n=== EXP 2: beneficiary != msg.sender ===");
  const w2 = new ethers.Wallet(ANVIL_PKS[2], provider);
  const w2b = new ethers.Wallet(ANVIL_PKS[3], provider);
  await setBal(w2.address);
  await setBal(w2b.address);
  const m2 = mineSalt("E2");
  const p2 = v6P({ name: "Probe E2", symbol: "PE2", beneficiary: w2b.address, commissionReceiver: w2.address, quoteAmt: ethers.parseEther("0.01"), salt: m2.salt });
  const r2 = await callV6(w2, p2, ethers.parseEther("0.01"));
  out.exp2 = { ok: r2.ok, err: r2.ed, msg: r2.msg };
  console.log(`E2 (beneficiary=${w2b.address}, signer=${w2.address}): ok=${r2.ok} err=${r2.ed} msg=${r2.msg?.slice(0, 140) || ""}`);

  // ============ EXP 3: cooldown semantics on V6 ============
  console.log("\n=== EXP 3: V6 cooldown semantics (same tx.origin retry) ===");
  const m3 = mineSalt("E3");
  const p3 = v6P({ name: "Probe E3", symbol: "PE3", beneficiary: w1.address, commissionReceiver: w1.address, quoteAmt: ethers.parseEther("0.01"), salt: m3.salt });
  const r3a = await callV6(w1, p3, ethers.parseEther("0.01"));
  out.exp3 = { retryImmediate: { ok: r3a.ok, err: r3a.ed, msg: r3a.msg?.slice(0, 140) } };
  console.log(`E3a (same EOA retry): ok=${r3a.ok} err=${r3a.ed} msg=${r3a.msg?.slice(0, 140) || ""}`);
  if (r3a.ed === "0xa7382e9b") {
    const decoder = ethers.AbiCoder.defaultAbiCoder();
    const full = (r3a.msg || "").match(/0xa7382e9b[a-fA-F0-9]+/)?.[0];
    if (full && full.length >= 138) {
      try {
        const [user, unlock] = decoder.decode(["address", "uint256"], "0x" + full.slice(10));
        const now = (await provider.getBlock("latest")).timestamp;
        out.exp3.retryImmediate.user = user;
        out.exp3.retryImmediate.unlockTime = unlock.toString();
        out.exp3.retryImmediate.now = now;
        out.exp3.retryImmediate.cooldownSec = Number(unlock - BigInt(now));
        console.log(`E3 RateLimitExceeded user=${user} unlockTime=${unlock} now=${now} delta=${out.exp3.retryImmediate.cooldownSec}s`);
      } catch (_) {}
    }
  }
  console.log("E3b: evm_increaseTime 95s then retry");
  await provider.send("evm_increaseTime", [95]);
  await provider.send("evm_mine", []);
  const m3b = mineSalt("E3b");
  const p3b = v6P({ name: "Probe E3b", symbol: "PE3B", beneficiary: w1.address, commissionReceiver: w1.address, quoteAmt: ethers.parseEther("0.01"), salt: m3b.salt });
  const r3b = await callV6(w1, p3b, ethers.parseEther("0.01"));
  out.exp3.retryAfter95s = { ok: r3b.ok, gas: r3b.receipt?.gasUsed?.toString(), err: r3b.ed };
  console.log(`E3b (after 95s): ok=${r3b.ok} gas=${r3b.receipt?.gasUsed?.toString()} err=${r3b.ed}`);

  // ============ EXP 4: V6 mid-curve launch with distinct commissionReceiver ============
  console.log("\n=== EXP 4: V6 quoteAmt=0.5 BNB, commissionReceiver = third-party EOA ===");
  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  const w4 = new ethers.Wallet(ANVIL_PKS[4], provider);
  await setBal(w4.address);
  const m4 = mineSalt("E4");
  const COMMISSION_RECV = "0xC0C0c0C0C0c0C0c0c0c0C0c0c0c0c0c0c0c0c0c0";
  const p4 = v6P({ name: "Probe E4", symbol: "PE4", beneficiary: w4.address, commissionReceiver: COMMISSION_RECV, quoteAmt: ethers.parseEther("0.5"), salt: m4.salt, buyTax: 1000, sellTax: 1000 });
  const r4 = await callV6(w4, p4, ethers.parseEther("0.5"));
  out.exp4 = { create: { ok: r4.ok, gas: r4.receipt?.gasUsed?.toString(), token: m4.predicted, err: r4.ed, msg: r4.msg } };
  console.log(`E4 create ok=${r4.ok} gas=${r4.receipt?.gasUsed?.toString()} err=${r4.ed}`);
  if (r4.ok) {
    const state = await portal.getTokenV8(m4.predicted);
    out.exp4.state = { status: state.status?.toString(), reserve: state.reserve?.toString(), progress: state.progress?.toString(), pool: state.pool };
    console.log(`E4 state status=${state.status} reserve=${ethers.formatEther(state.reserve)} progress=${state.progress}`);
    const procInfo = await readProcessor(m4.predicted);
    out.exp4.processor = procInfo.info;
    console.log(`E4 processor: ${JSON.stringify(procInfo.info)}`);
  }

  // ============ EXP 5: graduation at 16 BNB and 20 BNB ============
  console.log("\n=== EXP 5: V6 graduation quoteAmt = 16 BNB and 20 BNB ===");
  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  const w5 = new ethers.Wallet(ANVIL_PKS[6], provider);
  await setBal(w5.address);
  const m5 = mineSalt("E5_16");
  const p5 = v6P({ name: "Probe E5", symbol: "PE5", beneficiary: w5.address, commissionReceiver: w5.address, quoteAmt: ethers.parseEther("16"), salt: m5.salt });
  const r5 = await callV6(w5, p5, ethers.parseEther("16"));
  out.exp5 = { q16: { ok: r5.ok, gas: r5.receipt?.gasUsed?.toString(), token: m5.predicted, err: r5.ed } };
  console.log(`E5 q16 ok=${r5.ok} gas=${r5.receipt?.gasUsed?.toString()} err=${r5.ed}`);
  if (r5.ok) {
    const state = await portal.getTokenV8(m5.predicted);
    out.exp5.q16.state = { status: state.status?.toString(), reserve: state.reserve?.toString(), progress: state.progress?.toString(), pool: state.pool };
    out.exp5.q16.pair = await factory.getPair(m5.predicted, WBNB);
    console.log(`E5 q16 state status=${state.status} reserve=${ethers.formatEther(state.reserve)} progress=${state.progress} pool=${state.pool} pair=${out.exp5.q16.pair}`);
  }

  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  const w7 = new ethers.Wallet(ANVIL_PKS[7], provider);
  await setBal(w7.address);
  const m7 = mineSalt("E5_20");
  const p7 = v6P({ name: "Probe E5b", symbol: "PE5B", beneficiary: w7.address, commissionReceiver: w7.address, quoteAmt: ethers.parseEther("20"), salt: m7.salt });
  const r7 = await callV6(w7, p7, ethers.parseEther("20"));
  out.exp5.q20 = { ok: r7.ok, gas: r7.receipt?.gasUsed?.toString(), token: m7.predicted, err: r7.ed };
  console.log(`E5 q20 ok=${r7.ok} gas=${r7.receipt?.gasUsed?.toString()} err=${r7.ed}`);
  if (r7.ok) {
    const state = await portal.getTokenV8(m7.predicted);
    out.exp5.q20.state = { status: state.status?.toString(), reserve: state.reserve?.toString(), progress: state.progress?.toString(), pool: state.pool };
    out.exp5.q20.pair = await factory.getPair(m7.predicted, WBNB);
    out.exp5.q20.events = parseLogs(r7.receipt).map((e) => e.name);
    console.log(`E5 q20 status=${state.status} progress=${state.progress} pool=${state.pool} pair=${out.exp5.q20.pair} events=${out.exp5.q20.events.join(",")}`);
  }

  // ============ EXP 6: tax stream on a graduated token ============
  console.log("\n=== EXP 6: V6 tax stream → commissionReceiver receives after PCS swaps ===");
  if (r7.ok && out.exp5.q20.pair && out.exp5.q20.pair !== ZERO) {
    const trader = new ethers.Wallet(ANVIL_PKS[3], provider);
    await setBal(trader.address);
    const procInfo6 = await readProcessor(m7.predicted);
    out.exp6 = { token: m7.predicted, processorBefore: procInfo6.info };
    const COMMISSION = w7.address;
    const commissionBalBefore = await provider.getBalance(COMMISSION);
    const feeRecv = procInfo6.info.feeReceiver;
    const feeBalBefore = await provider.getBalance(feeRecv);
    console.log(`E6 commissionReceiver=${COMMISSION} balBefore=${ethers.formatEther(commissionBalBefore)} feeReceiver=${feeRecv} balBefore=${ethers.formatEther(feeBalBefore)}`);
    const router = new ethers.Contract(PCS_ROUTER, ROUTER_ABI, trader);
    const tk = new ethers.Contract(m7.predicted, TOKEN_V3_ABI, trader);
    try {
      const buy = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, m7.predicted], trader.address, 99999999999n, { value: ethers.parseEther("0.5"), gasLimit: 3_000_000 });
      const buyR = await buy.wait();
      console.log(`E6 buy gas=${buyR.gasUsed}`);
      const bal = await tk.balanceOf(trader.address);
      console.log(`E6 trader bal=${ethers.formatEther(bal)}`);
      const sellAmt = bal / 2n;
      await (await tk.approve(PCS_ROUTER, sellAmt)).wait();
      const sell = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(sellAmt, 0, [m7.predicted, WBNB], trader.address, 99999999999n, { gasLimit: 3_500_000 });
      const sellR = await sell.wait();
      console.log(`E6 sell gas=${sellR.gasUsed}`);
      const pendingPre = await procInfo6.proc.commissionQuoteBalance().catch(() => null);
      console.log(`E6 pending pre dispatch=${pendingPre}`);
      const dispatch = await procInfo6.proc.connect(trader).dispatch({ gasLimit: 3_000_000 });
      const dispR = await dispatch.wait();
      const commissionBalAfter = await provider.getBalance(COMMISSION);
      const feeBalAfter = await provider.getBalance(feeRecv);
      const commissionDelta = commissionBalAfter - commissionBalBefore;
      const feeDelta = feeBalAfter - feeBalBefore;
      const pendingPost = await procInfo6.proc.commissionQuoteBalance().catch(() => null);
      console.log(`E6 dispatch gas=${dispR.gasUsed}`);
      console.log(`E6 commissionReceiver delta=${ethers.formatEther(commissionDelta)} BNB`);
      console.log(`E6 feeReceiver delta=${ethers.formatEther(feeDelta)} BNB`);
      console.log(`E6 pending post dispatch=${pendingPost}`);
      out.exp6.commissionDelta = commissionDelta.toString();
      out.exp6.feeReceiverDelta = feeDelta.toString();
      out.exp6.dispatchGas = dispR.gasUsed?.toString();
      out.exp6.pendingPost = pendingPost?.toString() || null;
    } catch (e) {
      console.log(`E6 failed: ${e.shortMessage || e.message}`);
      out.exp6.error = e.shortMessage || e.message;
    }
  } else {
    out.exp6 = { skipped: "no graduated pair" };
  }

  fs.writeFileSync(__dirname + "/v6-v7-characterization.json", JSON.stringify(out, null, 2));
  console.log("\nwrote v6-v7-characterization.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
