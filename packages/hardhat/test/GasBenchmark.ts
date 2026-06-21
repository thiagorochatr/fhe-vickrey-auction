/**
 * Gas benchmark for the ConfidentialVickreyAuction contract.
 *
 * Runs auctions with N ∈ {3, 5, 10} bidders, REPEATS repetitions each, and
 * collects: gas used per operation, calldata size for `bid`. Exports a CSV.
 *
 * Notes:
 * - The CoFHE mock inflates FHE operation gas costs relative to real Fhenix
 *   (the mocks record ciphertexts on-chain for testability). Treat these
 *   numbers as upper bounds on the real ones.
 * - For real Arbitrum Sepolia numbers, run the same scenarios on testnet
 *   with --network arb-sepolia (separate run; this script targets `hardhat`).
 */
import hre, { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Encryptable, CofheClient } from "@cofhe/sdk";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { ConfidentialVickreyAuction } from "../typechain-types";
import * as fs from "fs";
import * as path from "path";

const NS = [3, 5, 10] as const;
const REPEATS = 5;
const COLLATERAL = ethers.parseEther("1");
const DURATION = 3600;

interface Row {
  run_id: number;
  n_bidders: number;
  operation: string;
  bidder_index: number | null;
  gas_used: string;
  calldata_size_bytes: number | null;
}

async function deploy(): Promise<{
  auction: ConfidentialVickreyAuction;
  cofheClient: CofheClient;
  signers: HardhatEthersSigner[];
}> {
  const signers = await ethers.getSigners();
  const cofheClient = await hre.cofhe.createClientWithBatteries(signers[0]);
  const Factory = await ethers.getContractFactory(
    "ConfidentialVickreyAuction",
    signers[0],
  );
  const auction = (await Factory.deploy()) as unknown as ConfidentialVickreyAuction;
  await auction.waitForDeployment();
  return { auction, cofheClient, signers };
}

async function runOne(
  env: Awaited<ReturnType<typeof deploy>>,
  runId: number,
  n: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  const { auction, cofheClient, signers } = env;
  // signers[0] is the deployer; use signers[1] as seller and signers[2..2+n]
  // as bidders so the seller is independent (shill-bid prevention).
  const seller = signers[1];
  const bidders = signers.slice(2, 2 + n);
  if (bidders.length !== n) {
    throw new Error(
      `Not enough signers for N=${n}: got ${bidders.length}. Configure hardhat.config.ts accounts.count.`,
    );
  }

  // ---- createAuction ----
  const now = await time.latest();
  const startTime = now + 60;
  const endTime = startTime + DURATION;
  let tx = await auction
    .connect(seller)
    .createAuction(`Run-${runId}-N${n}`, BigInt(runId), COLLATERAL, startTime, endTime);
  let receipt = await tx.wait();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "createAuction",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
  });
  const event = receipt!.logs.find(
    (l) => "fragment" in l && (l as any).fragment.name === "AuctionCreated",
  ) as any;
  const auctionId = event.args[0] as bigint;
  await time.increaseTo(startTime);

  // ---- bids ----
  for (let i = 0; i < n; i++) {
    const b = bidders[i];
    const amount = BigInt(100 + i); // any plaintext fits — gas of FHE ops is
    // independent of the cleartext value (it depends on ciphertext layout).
    await hre.cofhe.connectWithHardhatSigner(cofheClient, b);
    const [encrypted] = await cofheClient
      .encryptInputs([Encryptable.uint64(amount)])
      .execute();
    tx = await auction
      .connect(b)
      .bid(auctionId, encrypted, { value: COLLATERAL });
    receipt = await tx.wait();
    const calldataBytes = (tx.data.length - 2) / 2;
    rows.push({
      run_id: runId,
      n_bidders: n,
      operation: "bid",
      bidder_index: i,
      gas_used: receipt!.gasUsed.toString(),
      calldata_size_bytes: calldataBytes,
    });
  }

  // ---- requestSettlement ----
  await time.increaseTo(endTime + 1);
  tx = await auction.connect(seller).requestSettlement(auctionId);
  receipt = await tx.wait();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "requestSettlement",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
  });

  // ---- finalizeSettlement ----
  const [winnerCt, secondPriceCt] = await auction.getSettlementCtHashes(auctionId);
  await hre.cofhe.connectWithHardhatSigner(cofheClient, seller);
  const winnerRes = await cofheClient
    .decryptForTx(winnerCt)
    .withoutPermit()
    .execute();
  const secondRes = await cofheClient
    .decryptForTx(secondPriceCt)
    .withoutPermit()
    .execute();
  const winnerAddr = ethers.getAddress(
    "0x" + winnerRes.decryptedValue.toString(16).padStart(40, "0"),
  );
  const secondPrice = secondRes.decryptedValue;
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
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "finalizeSettlement",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
  });

  // ---- withdraws ----
  // seller
  tx = await auction.connect(seller).withdraw(auctionId);
  receipt = await tx.wait();
  rows.push({
    run_id: runId,
    n_bidders: n,
    operation: "withdraw_seller",
    bidder_index: null,
    gas_used: receipt!.gasUsed.toString(),
    calldata_size_bytes: null,
  });
  // each bidder (winner has a different code path, but for gas reporting we
  // group as `withdraw_bidder`).
  for (let i = 0; i < n; i++) {
    tx = await auction.connect(bidders[i]).withdraw(auctionId);
    receipt = await tx.wait();
    rows.push({
      run_id: runId,
      n_bidders: n,
      operation: "withdraw_bidder",
      bidder_index: i,
      gas_used: receipt!.gasUsed.toString(),
      calldata_size_bytes: null,
    });
  }

  return rows;
}

function toCsv(rows: Row[]): string {
  const header =
    "run_id,n_bidders,operation,bidder_index,gas_used,calldata_size_bytes";
  const lines = rows.map(
    (r) =>
      `${r.run_id},${r.n_bidders},${r.operation},${r.bidder_index ?? ""},${r.gas_used},${
        r.calldata_size_bytes ?? ""
      }`,
  );
  return [header, ...lines].join("\n") + "\n";
}

describe("GasBenchmark", function () {
  this.timeout(15 * 60 * 1000);

  it(`runs N ∈ {3, 5, 10} with ${REPEATS} reps each and writes CSV`, async () => {
    const env = await deploy();
    const allRows: Row[] = [];
    let runId = 0;

    for (const n of NS) {
      for (let r = 0; r < REPEATS; r++) {
        runId++;
        console.log(`run ${runId}: N=${n} rep=${r + 1}/${REPEATS}`);
        const rows = await runOne(env, runId, n);
        allRows.push(...rows);
      }
    }

    const csv = toCsv(allRows);
    const outDir = path.resolve(__dirname, "../../../dados");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "benchmarks-mock.csv");
    fs.writeFileSync(outFile, csv);
    console.log(`\nWrote ${allRows.length} rows to ${outFile}`);

    // Print a per-operation × N summary to stdout for quick inspection.
    const byKey = new Map<string, bigint[]>();
    for (const row of allRows) {
      const key = `${row.operation}|N=${row.n_bidders}`;
      const arr = byKey.get(key) ?? [];
      arr.push(BigInt(row.gas_used));
      byKey.set(key, arr);
    }
    console.log("\nSummary (gas_used average per operation × N):");
    const sortedKeys = Array.from(byKey.keys()).sort();
    for (const k of sortedKeys) {
      const xs = byKey.get(k)!;
      const sum = xs.reduce((a, b) => a + b, 0n);
      const avg = sum / BigInt(xs.length);
      console.log(`  ${k.padEnd(36)}  avg=${avg}  n=${xs.length}`);
    }
  });
});
