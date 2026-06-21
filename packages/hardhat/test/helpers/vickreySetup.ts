import hre, { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Encryptable, CofheClient } from "@cofhe/sdk";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { ConfidentialVickreyAuction } from "../../typechain-types";

export const DEFAULT_NAME = "Test Auction";
export const DEFAULT_ITEM_ID = 42n;
export const DEFAULT_COLLATERAL = ethers.parseEther("1"); // 1 ETH
export const DEFAULT_BID_DURATION = 3600; // 1 hour
export const MIN_BIDDERS = 3;

export interface VickreyEnv {
  auction: ConfidentialVickreyAuction;
  cofheClient: CofheClient;
  deployer: HardhatEthersSigner;
  seller: HardhatEthersSigner;
  bidders: HardhatEthersSigner[];
}

/// Deploy contract + initialize a CoFHE client connected to `deployer`.
export async function deployVickrey(): Promise<VickreyEnv> {
  const [deployer, seller, b1, b2, b3, b4, b5] = await ethers.getSigners();

  const cofheClient = await hre.cofhe.createClientWithBatteries(deployer);

  const Factory = await ethers.getContractFactory(
    "ConfidentialVickreyAuction",
    deployer,
  );
  const auction = (await Factory.deploy()) as unknown as ConfidentialVickreyAuction;
  await auction.waitForDeployment();

  return {
    auction,
    cofheClient,
    deployer,
    seller,
    bidders: [b1, b2, b3, b4, b5],
  };
}

/// Reconnect the CoFHE client to a different signer (each bidder needs its own
/// connection so the encryption is performed against their account).
export async function connectAs(
  client: CofheClient,
  signer: HardhatEthersSigner,
): Promise<void> {
  await hre.cofhe.connectWithHardhatSigner(client, signer);
}

/// Create a fresh auction starting `inSeconds` from now and lasting
/// `durationSeconds`.
export async function createDefaultAuction(
  env: VickreyEnv,
  opts: {
    inSeconds?: number;
    durationSeconds?: number;
    collateralAmount?: bigint;
    name?: string;
    itemId?: bigint;
  } = {},
): Promise<bigint> {
  const inSeconds = opts.inSeconds ?? 60;
  const durationSeconds = opts.durationSeconds ?? DEFAULT_BID_DURATION;
  const collateralAmount = opts.collateralAmount ?? DEFAULT_COLLATERAL;
  const name = opts.name ?? DEFAULT_NAME;
  const itemId = opts.itemId ?? DEFAULT_ITEM_ID;

  const now = await time.latest();
  const startTime = now + inSeconds;
  const endTime = startTime + durationSeconds;

  const tx = await env.auction
    .connect(env.seller)
    .createAuction(name, itemId, collateralAmount, startTime, endTime);
  const receipt = await tx.wait();

  // auctionId is nextAuctionId - 1 (it was incremented during createAuction).
  // We read it from event AuctionCreated.
  const event = receipt!.logs.find(
    (l) =>
      "fragment" in l && (l as any).fragment.name === "AuctionCreated",
  ) as any;
  const auctionId = event.args[0] as bigint;

  // Advance time so the auction is open.
  await time.increaseTo(startTime);

  return auctionId;
}

/// Encrypt `amount` as a uint64 for a specific bidder, then call `bid` with the
/// configured collateral.
export async function placeBid(
  env: VickreyEnv,
  auctionId: bigint,
  bidder: HardhatEthersSigner,
  amount: bigint,
  collateralAmount: bigint = DEFAULT_COLLATERAL,
): Promise<void> {
  await connectAs(env.cofheClient, bidder);
  const [encrypted] = await env.cofheClient
    .encryptInputs([Encryptable.uint64(amount)])
    .execute();
  await env.auction
    .connect(bidder)
    .bid(auctionId, encrypted, { value: collateralAmount });
}

/// Advance time past the auction's endTime so settlement is allowed.
export async function advancePastDeadline(
  env: VickreyEnv,
  auctionId: bigint,
): Promise<void> {
  const a = await env.auction.getAuction(auctionId);
  await time.increaseTo(Number(a.endTime) + 1);
}

/// Call requestSettlement (from any signer).
export async function requestSettlement(
  env: VickreyEnv,
  auctionId: bigint,
  caller?: HardhatEthersSigner,
): Promise<void> {
  await env.auction
    .connect(caller ?? env.deployer)
    .requestSettlement(auctionId);
}

/// Off-chain decryption via the TSN mock, then call finalizeSettlement
/// providing the plaintext + proofs.
export async function finalizeSettlement(
  env: VickreyEnv,
  auctionId: bigint,
  caller?: HardhatEthersSigner,
): Promise<{ winner: string; secondPrice: bigint }> {
  const [winnerCt, secondPriceCt] =
    await env.auction.getSettlementCtHashes(auctionId);

  await connectAs(env.cofheClient, caller ?? env.deployer);

  const winnerResult = await env.cofheClient
    .decryptForTx(winnerCt)
    .withoutPermit()
    .execute();
  const secondPriceResult = await env.cofheClient
    .decryptForTx(secondPriceCt)
    .withoutPermit()
    .execute();

  // `decryptedValue` for an eaddress comes back as a bigint (uint160).
  // Convert it to a checksum-cased hex address.
  const winnerAddr = ethers.getAddress(
    "0x" + winnerResult.decryptedValue.toString(16).padStart(40, "0"),
  );
  const secondPrice = secondPriceResult.decryptedValue;

  await env.auction
    .connect(caller ?? env.deployer)
    .finalizeSettlement(
      auctionId,
      winnerAddr,
      secondPrice,
      winnerResult.signature,
      secondPriceResult.signature,
    );

  return { winner: winnerAddr, secondPrice };
}
