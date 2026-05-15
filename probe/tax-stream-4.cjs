// Tax stream v4: track fee flow during swaps.

const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");
const fs = require("fs");
const path = require("path");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x29e6383f0ce68507B5A72a53c2B118a118332Aa8";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const FEE_RECEIVER_GLOBAL = "0x8a08d98cbb218fceb318ecf3abc1ba43d8a7ab0e";
const ZERO = ethers.ZeroAddress;

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

function cloneInitCode(impl) { return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`; }
function predict(salt) { return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL))); }
function mineSalt(label) { let s = ethers.keccak256(ethers.toUtf8Bytes(`tx4 ${label} ${Date.now()} ${Math.random()}`)); while (!predict(s).toLowerCase().endsWith("7777")) s = ethers.keccak256(s); return s; }

const PORTAL_ABI = ["function newTokenV2((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint16 tax,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData) params) payable returns (address)", "function getTokenV8(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId) state)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function taxSplitter() view returns (address)", "function transfer(address,uint256) returns (bool)"];
const ROUTER_ABI = ["function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) payable", "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] calldata path,address to,uint256 deadline)"];

function fmt(v) { return v == null ? "n/a" : ethers.formatUnits(v, 18); }
function buildParams(label, beneficiary, value) {
  return { name: `T${label}`.slice(0, 12), symbol: `T${label}`.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8), meta: "QmTax4", dexThresh: 1, salt: mineSalt(label), tax: 1000, migratorType: 1, quoteToken: ZERO, quoteAmt: value, beneficiary, permitData: "0x" };
}

async function balances(label, addrs, token) {
  const out = {};
  for (const [name, addr] of Object.entries(addrs)) {
    out[name] = { eth: await provider.getBalance(addr), token: await token.balanceOf(addr) };
  }
  console.log(`\n[${label}]`);
  for (const [name, b] of Object.entries(out)) {
    console.log(`  ${name.padEnd(16)} eth=${fmt(b.eth).padEnd(20)} token=${fmt(b.token)}`);
  }
  return out;
}

function diff(after, before) {
  const out = {};
  for (const name of Object.keys(after)) {
    out[name] = { eth: (after[name].eth - before[name].eth).toString(), token: (after[name].token - before[name].token).toString() };
  }
  return out;
}

async function main() {
  const findings = {};

  const creatorRaw = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`txc ${Date.now()} ${Math.random()}`)), provider);
  const swapperRaw = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`txs ${Date.now()} ${Math.random()}`)), provider);
  const creator = new ethers.NonceManager(creatorRaw); creator.address = creatorRaw.address;
  const swapper = new ethers.NonceManager(swapperRaw); swapper.address = swapperRaw.address;
  await provider.send("evm_setAccountBalance", [creator.address, "0x" + (1000n * 10n**18n).toString(16)]);
  await provider.send("evm_setAccountBalance", [swapper.address, "0x" + (1000n * 10n**18n).toString(16)]);
  console.log(`creator=${creator.address}  swapper=${swapper.address}`);

  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, creator);
  const params = buildParams("FT", creator.address, ethers.parseEther("20"));
  const tokenAddr = predict(params.salt);
  console.log(`token=${tokenAddr}`);
  const launchR = await (await portal.newTokenV2(params, { value: ethers.parseEther("20"), gasLimit: 18_000_000 })).wait();
  const state = await portal.getTokenV8(tokenAddr);
  console.log(`launch gas=${launchR.gasUsed} status=${state.status} pool=${state.pool}`);
  findings.launch = { gas: launchR.gasUsed.toString(), status: Number(state.status), pool: state.pool };

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, swapper);
  const splitter = await token.taxSplitter();
  console.log(`taxSplitter=${splitter}`);
  findings.taxSplitter = splitter;

  const watch = {
    creator: creator.address,
    swapper: swapper.address,
    pool: state.pool,
    splitter,
    feeReceiver: FEE_RECEIVER_GLOBAL,
    portal: PORTAL,
  };

  const router = new ethers.Contract(PCS_ROUTER, ROUTER_ABI, swapper);
  const before = await balances("pre-buy", watch, token);

  console.log("\n=== buy 0.5 BNB ===");
  const buyR = await (await router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, tokenAddr], swapper.address, 9_999_999_999, { value: ethers.parseEther("0.5"), gasLimit: 3_000_000 })).wait();
  console.log(`buy gas=${buyR.gasUsed}`);
  const afterBuy = await balances("post-buy", watch, token);
  findings.buyDeltas = diff(afterBuy, before);
  console.log("buy deltas:", JSON.stringify(findings.buyDeltas, null, 2));

  console.log("\n=== sell half ===");
  const tokBal = await token.balanceOf(swapper.address);
  const sellAmt = tokBal / 2n;
  await (await token.approve(PCS_ROUTER, sellAmt)).wait();
  const sellR = await (await router.swapExactTokensForETHSupportingFeeOnTransferTokens(sellAmt, 0, [tokenAddr, WBNB], swapper.address, 9_999_999_999, { gasLimit: 3_000_000 })).wait();
  console.log(`sell gas=${sellR.gasUsed}`);
  const afterSell = await balances("post-sell", watch, token);
  findings.sellDeltas = diff(afterSell, afterBuy);
  console.log("sell deltas:", JSON.stringify(findings.sellDeltas, null, 2));

  // Try a transfer (10% tax should apply on user-to-user transfer)
  console.log("\n=== swapper transfers 1000 tokens to creator (tax on transfer) ===");
  try {
    const transferR = await (await token.transfer(creator.address, ethers.parseUnits("1000", 18))).wait();
    console.log(`transfer gas=${transferR.gasUsed}`);
  } catch (e) {
    console.log(`transfer failed: ${e.shortMessage}`);
  }
  const afterTransfer = await balances("post-transfer", watch, token);
  findings.transferDeltas = diff(afterTransfer, afterSell);
  console.log("transfer deltas:", JSON.stringify(findings.transferDeltas, null, 2));

  // Check splitter's pending balance — if tokens accumulated, try various withdrawal methods
  console.log("\n=== splitter inspection ===");
  console.log(`splitter eth=${fmt(await provider.getBalance(splitter))}  token=${fmt(await token.balanceOf(splitter))}`);
  const feeReceiverBefore = await provider.getBalance(FEE_RECEIVER_GLOBAL);

  // Try dispatch() — succeeded earlier but had 0 effect; try with explicit token arg
  const sigs = ["dispatch()", "dispatch(address)", "release()", "release(address)", "claim(address)", "withdraw(address)", "swapAndDistribute()", "convert()", "convertAndDistribute()"];
  for (const sig of sigs) {
    let data;
    if (sig.includes("address")) {
      data = ethers.id(sig).slice(0, 10) + tokenAddr.slice(2).padStart(64, "0");
    } else {
      data = ethers.id(sig).slice(0, 10);
    }
    try {
      const tx = await swapper.sendTransaction({ to: splitter, data, gasLimit: 3_000_000 });
      const r = await tx.wait();
      console.log(`  ${sig} → OK gas=${r.gasUsed}`);
    } catch (e) {
      console.log(`  ${sig} → revert`);
    }
  }
  const feeReceiverAfter = await provider.getBalance(FEE_RECEIVER_GLOBAL);
  console.log(`\nglobal feeReceiver (${FEE_RECEIVER_GLOBAL}) before=${fmt(feeReceiverBefore)} after=${fmt(feeReceiverAfter)} delta=${fmt(feeReceiverAfter - feeReceiverBefore)}`);
  findings.feeReceiverFinalDelta = (feeReceiverAfter - feeReceiverBefore).toString();

  fs.writeFileSync(path.join(__dirname, "tax-stream-4.json"), JSON.stringify(findings, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log("\n=== written tax-stream-4.json ===");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
