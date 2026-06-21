/**
 * Real-network gas benchmark for ConfidentialVickreyAuction.
 *
 * Runs leilões with N ∈ {3, 5, 10} bidders × 5 reps against the contract
 * already deployed on Arbitrum Sepolia. Generates 10 random bidder wallets,
 * funds each with the deployer's ETH testnet, then collects gas, calldata,
 * and wall-clock latencies into dados/benchmarks-testnet.csv.
 *
 * Usage:
 *   pnpm hardhat run scripts/benchmarkTestnet.ts --network arb-sepolia
 */
import { ethers } from "hardhat";
import { Encryptable } from "@cofhe/sdk";
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/node";
import { chains } from "@cofhe/sdk/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import type { ConfidentialVickreyAuction } from "../typechain-types";

const CONTRACT_ADDRESS = "0x1eEa76147cBCD878D1cb5B8fdCb6bd0Ed836D811";
const RPC_URL = "https://arbitrum-sepolia.publicnode.com";
// Default scenario; can be overridden by NS_OVERRIDE="3,5,10" and
// RUN_ID_START=11 so an aborted run can be resumed.
const NS: readonly number[] = process.env.NS_OVERRIDE
  ? process.env.NS_OVERRIDE.split(",").map((s) => Number(s.trim()))
  : [3, 5, 10];
const REPEATS = process.env.REPEATS ? Number(process.env.REPEATS) : 5;
const RUN_ID_START = process.env.RUN_ID_START
  ? Number(process.env.RUN_ID_START) - 1
  : 0;
const OUT_FILE = process.env.OUT_FILE ?? "benchmarks-testnet.csv";
const COLLATERAL = ethers.parseEther("0.001"); // 0.001 ETH per bidder
const FUND_PER_WALLET = ethers.parseEther("0.01"); // covers 5 reps × collateral + gas
// Per-bidder budget: ~10s encryption + ~5s tx inclusion + slack. Auctions with
// more bidders need a longer window before `endTime` so the last bid still
// lands while the leilão is Active.
function durationFor(n: number): number {
  return 30 + n * 20;
}

interface Row {
  run_id: number;
  n_bidders: number;
  operation: string;
  bidder_index: number | null;
  gas_used: string;
  calldata_size_bytes: number | null;
  wall_time_ms: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fundWallet(
  deployer: any,
  to: string,
  amount: bigint,
): Promise<void> {
  const tx = await deployer.sendTransaction({ to, value: amount });
  await tx.wait();
}

async function runOne(
  auction: ConfidentialVickreyAuction,
  cofheClient: any,
  publicClient: any,
  seller: any,
  bidderWallets: any[],
  bidderViemClients: any[],
  runId: number,
  n: number,
): Promise<Row[]> {
  const rows: Row[] = [];

  // ---- createAuction ----
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = startTime + durationFor(n);
  const t0 = Date.now();
  let tx = await auction
    .connect(seller)
    .createAuction(
      `Bench-${runId}-N${n}`,
      BigInt(runId),
      COLLATERAL,
      startTime,
      endTime,
    );
  let receipt = await tx.wait();
  const t1 = Date.now();
  const event = receipt!.logs.find(
    (l: any) => "fragment" in l && l.fragment?.name === "AuctionCreated",
  ) as any;
  const auctionId = event.args[0] as bigint;
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "createAuction",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
    wall_time_ms: t1 - t0,
  });

  // ---- bids ----
  for (let i = 0; i < n; i++) {
    const bidderEthers = bidderWallets[i];
    const bidderViem = bidderViemClients[i];
    const amount = BigInt(100 + i);

    // Reconnect the cofheClient with this bidder's viem wallet for encryption.
    await cofheClient.connect(publicClient, bidderViem);

    const tEncStart = Date.now();
    const [encrypted] = await cofheClient
      .encryptInputs([Encryptable.uint64(amount)])
      .execute();
    const tEncEnd = Date.now();
    rows.push({
      run_id: runId,
      n_bidders: n,
      operation: "bid_encrypt",
      bidder_index: i,
      gas_used: "0",
      calldata_size_bytes: null,
      wall_time_ms: tEncEnd - tEncStart,
    });

    const tBidStart = Date.now();
    tx = await auction
      .connect(bidderEthers)
      .bid(auctionId, encrypted, { value: COLLATERAL });
    receipt = await tx.wait();
    const tBidEnd = Date.now();
    const calldataBytes = (tx.data.length - 2) / 2;
    rows.push({
      run_id: runId,
      n_bidders: n,
      operation: "bid",
      bidder_index: i,
      gas_used: receipt!.gasUsed.toString(),
      calldata_size_bytes: calldataBytes,
      wall_time_ms: tBidEnd - tBidStart,
    });
  }

  // ---- wait until endTime ----
  const nowMs = Date.now();
  const waitMs = endTime * 1000 - nowMs + 2000;
  if (waitMs > 0) {
    console.log(`    waiting ${Math.ceil(waitMs / 1000)}s for endTime…`);
    await sleep(waitMs);
  }

  // ---- requestSettlement ----
  const t2 = Date.now();
  tx = await auction.connect(seller).requestSettlement(auctionId);
  receipt = await tx.wait();
  const t3 = Date.now();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "requestSettlement",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
    wall_time_ms: t3 - t2,
  });

  // ---- decrypt + finalizeSettlement ----
  const [winnerCt, secondPriceCt] = await auction.getSettlementCtHashes(auctionId);
  await cofheClient.connect(publicClient, bidderViemClients[0]); // use any
  const tDecStart = Date.now();
  const winnerRes = await cofheClient
    .decryptForTx(winnerCt)
    .withoutPermit()
    .execute();
  const secondRes = await cofheClient
    .decryptForTx(secondPriceCt)
    .withoutPermit()
    .execute();
  const tDecEnd = Date.now();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "tsn_decrypt",
    bidder_index: null,
    gas_used: "0",
    calldata_size_bytes: null,
    wall_time_ms: tDecEnd - tDecStart,
  });

  const winnerAddr = ethers.getAddress(
    "0x" + winnerRes.decryptedValue.toString(16).padStart(40, "0"),
  );
  const secondPrice = secondRes.decryptedValue;
  const t4 = Date.now();
  tx = await auction
    .connect(seller)
    .finalizeSettlement(
      auctionId,
      winnerAddr,
      secondPrice,
      winnerRes.signature,
      secondRes.signature,
    );
  receipt = await tx.wait();
  const t5 = Date.now();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "finalizeSettlement",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
    wall_time_ms: t5 - t4,
  });

  // ---- withdraws ----
  const t6 = Date.now();
  tx = await auction.connect(seller).withdraw(auctionId);
  receipt = await tx.wait();
  const t7 = Date.now();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "withdraw_seller",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
    wall_time_ms: t7 - t6,
  });
  for (let i = 0; i < n; i++) {
    const t8 = Date.now();
    tx = await auction.connect(bidderWallets[i]).withdraw(auctionId);
    receipt = await tx.wait();
    const t9 = Date.now();
    rows.push({
      run_id: runId,
      n_bidders: n,
      operation: "withdraw_bidder",
      bidder_index: i,
      gas_used: receipt!.gasUsed.toString(),
      calldata_size_bytes: null,
      wall_time_ms: t9 - t8,
    });
  }

  return rows;
}

function toCsv(rows: Row[]): string {
  const header =
    "run_id,n_bidders,operation,bidder_index,gas_used,calldata_size_bytes,wall_time_ms";
  const lines = rows.map(
    (r) =>
      `${r.run_id},${r.n_bidders},${r.operation},${r.bidder_index ?? ""},${r.gas_used},${
        r.calldata_size_bytes ?? ""
      },${r.wall_time_ms}`,
  );
  return [header, ...lines].join("\n") + "\n";
}

async function main() {
  // Use PublicNode directly. The official Arbitrum Sepolia RPC has flaky
  // feeHistory, which makes ethers' EIP-1559 estimator unreliable.
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployerPk = process.env.PRIVATE_KEY;
  if (!deployerPk) throw new Error("PRIVATE_KEY not set in env");
  const deployer = new ethers.Wallet(
    deployerPk.startsWith("0x") ? deployerPk : `0x${deployerPk}`,
    provider,
  );

  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);
  console.log(
    "Balance :",
    ethers.formatEther(await provider.getBalance(deployerAddr)),
    "ETH",
  );

  // Generate 10 bidder wallets (ethers Wallet + viem clients).
  console.log("\nGenerating 10 bidder wallets…");
  const bidderWallets: any[] = [];
  const bidderViemClients: any[] = [];
  for (let i = 0; i < 10; i++) {
    const w = ethers.Wallet.createRandom().connect(provider);
    bidderWallets.push(w);
    const account = privateKeyToAccount(w.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(RPC_URL),
    });
    bidderViemClients.push(walletClient);
  }

  // Fund each bidder.
  console.log("Funding bidder wallets…");
  for (let i = 0; i < bidderWallets.length; i++) {
    const addr = await bidderWallets[i].getAddress();
    console.log(`  [${i}] ${addr}  ← ${ethers.formatEther(FUND_PER_WALLET)} ETH`);
    await fundWallet(deployer, addr, FUND_PER_WALLET);
  }

  // Shared viem publicClient for cofheClient.
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(RPC_URL),
  });

  // CofheClient created via SDK directly (no hre.cofhe — that path uses
  // hardhat_impersonateAccount which is not available on a real testnet RPC).
  const cofheConfig = createCofheConfig({
    supportedChains: [chains.arbSepolia],
  });
  const cofheClient = createCofheClient(cofheConfig);
  const deployerAccount = privateKeyToAccount(
    (deployerPk.startsWith("0x") ? deployerPk : `0x${deployerPk}`) as `0x${string}`,
  );
  const deployerViem = createWalletClient({
    account: deployerAccount,
    chain: arbitrumSepolia,
    transport: http(RPC_URL),
  });
  await cofheClient.connect(publicClient, deployerViem);

  const auction = (await ethers.getContractAt(
    "ConfidentialVickreyAuction",
    CONTRACT_ADDRESS,
    deployer,
  )) as unknown as ConfidentialVickreyAuction;

  const allRows: Row[] = [];
  let runId = RUN_ID_START;

  for (const n of NS) {
    for (let r = 0; r < REPEATS; r++) {
      runId++;
      console.log(`\n=== run ${runId}: N=${n} rep=${r + 1}/${REPEATS} ===`);
      const rows = await runOne(
        auction,
        cofheClient,
        publicClient,
        deployer,
        bidderWallets.slice(0, n),
        bidderViemClients.slice(0, n),
        runId,
        n,
      );
      allRows.push(...rows);

      // Write incrementally so we don't lose data if the script aborts.
      const outDir = path.resolve(__dirname, "../../../dados");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, OUT_FILE), toCsv(allRows));
    }
  }

  console.log(`\nWrote ${allRows.length} rows to dados/${OUT_FILE}`);

  // Best-effort: drain remaining ETH from bidder wallets back to the deployer.
  console.log("\nDraining bidder wallets back to deployer…");
  for (let i = 0; i < bidderWallets.length; i++) {
    try {
      const w = bidderWallets[i];
      const addr = await w.getAddress();
      const bal = await provider.getBalance(addr);
      if (bal === 0n) continue;
      // Use a generous legacy gasPrice (×2) to match the frontend pattern.
      const gp = await provider.getFeeData();
      const price = gp.gasPrice ? gp.gasPrice * 2n : ethers.parseUnits("0.1", "gwei");
      const gas = 21000n;
      const fee = price * gas;
      if (bal <= fee) continue;
      const value = bal - fee;
      const tx = await w.sendTransaction({
        to: deployerAddr,
        value,
        gasPrice: price,
        gasLimit: gas,
        type: 0,
      });
      await tx.wait();
      console.log(`  [${i}] drained ${ethers.formatEther(value)} ETH`);
    } catch (e: any) {
      console.log(`  [${i}] drain failed: ${e?.message ?? e}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
