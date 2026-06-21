import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Encryptable } from "@cofhe/sdk";
import {
  deployVickrey,
  createDefaultAuction,
  placeBid,
  advancePastDeadline,
  requestSettlement,
  finalizeSettlement,
  connectAs,
  DEFAULT_COLLATERAL,
  DEFAULT_NAME,
  DEFAULT_ITEM_ID,
  MIN_BIDDERS,
} from "./helpers/vickreySetup";

describe("ConfidentialVickreyAuction", () => {
  describe("createAuction", () => {
    it("creates an auction in Active status with the provided parameters", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      const a = await env.auction.getAuction(auctionId);
      expect(a.name).to.equal(DEFAULT_NAME);
      expect(a.seller).to.equal(env.seller.address);
      expect(a.itemId).to.equal(DEFAULT_ITEM_ID);
      expect(a.collateralAmount).to.equal(DEFAULT_COLLATERAL);
      expect(a.status).to.equal(0n); // Active
      expect(a.totalBids).to.equal(0n);
    });

    it("reverts if name is empty", async () => {
      const env = await deployVickrey();
      const now = await time.latest();
      await expect(
        env.auction
          .connect(env.seller)
          .createAuction("", 1n, DEFAULT_COLLATERAL, now + 10, now + 100),
      ).to.be.revertedWithCustomError(env.auction, "NameRequired");
    });

    it("reverts if collateral is zero", async () => {
      const env = await deployVickrey();
      const now = await time.latest();
      await expect(
        env.auction
          .connect(env.seller)
          .createAuction("X", 1n, 0n, now + 10, now + 100),
      ).to.be.revertedWithCustomError(env.auction, "WrongCollateral");
    });

    it("allows startTime in the past (instant-start auction)", async () => {
      const env = await deployVickrey();
      const now = await time.latest();
      // startTime well in the past, endTime in the future → must succeed.
      await expect(
        env.auction
          .connect(env.seller)
          .createAuction("Past", 1n, DEFAULT_COLLATERAL, now - 60, now + 600),
      ).to.not.be.reverted;
    });

    it("reverts if endTime is already in the past", async () => {
      const env = await deployVickrey();
      const now = await time.latest();
      await expect(
        env.auction
          .connect(env.seller)
          .createAuction("Past", 1n, DEFAULT_COLLATERAL, now - 100, now - 10),
      ).to.be.revertedWithCustomError(env.auction, "InvalidTimeRange");
    });
  });

  describe("bid", () => {
    it("accepts a bid with the exact collateral", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 100n);

      const a = await env.auction.getAuction(auctionId);
      expect(a.totalBids).to.equal(1n);
      expect(await env.auction.hasBid(auctionId, env.bidders[0].address)).to.be
        .true;
    });

    it("rejects a bid with the wrong collateral value", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      // Cipher OK, but msg.value off
      await connectAs(env.cofheClient, env.bidders[0]);
      const [encrypted] = await env.cofheClient
        .encryptInputs([Encryptable.uint64(100n)])
        .execute();
      await expect(
        env.auction
          .connect(env.bidders[0])
          .bid(auctionId, encrypted, { value: DEFAULT_COLLATERAL / 2n }),
      ).to.be.revertedWithCustomError(env.auction, "WrongCollateral");
    });

    it("rejects a second bid from the same address", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      await placeBid(env, auctionId, env.bidders[0], 100n);
      await expect(
        placeBid(env, auctionId, env.bidders[0], 200n),
      ).to.be.revertedWithCustomError(env.auction, "AlreadyBid");
    });

    it("rejects a bid after deadline", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      await advancePastDeadline(env, auctionId);
      await expect(
        placeBid(env, auctionId, env.bidders[0], 100n),
      ).to.be.revertedWithCustomError(env.auction, "AuctionEnded");
    });

    it("rejects a bid from the seller (shill bid)", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      await expect(
        placeBid(env, auctionId, env.seller, 100n),
      ).to.be.revertedWithCustomError(env.auction, "SellerCannotBid");
    });
  });

  describe("requestSettlement", () => {
    it("rejects request before deadline", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 200n);
      await placeBid(env, auctionId, env.bidders[2], 150n);
      await expect(
        requestSettlement(env, auctionId),
      ).to.be.revertedWithCustomError(env.auction, "AuctionNotEnded");
    });

    it("rejects request with fewer than MIN_BIDDERS bidders", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);
      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 200n);
      await advancePastDeadline(env, auctionId);
      await expect(
        requestSettlement(env, auctionId),
      ).to.be.revertedWithCustomError(env.auction, "InsufficientBidders");
    });
  });

  describe("full Vickrey flow", () => {
    it("3 distinct bidders: winner pays the second-highest price", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 300n);
      await placeBid(env, auctionId, env.bidders[2], 200n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(
        env,
        auctionId,
      );

      expect(winner.toLowerCase()).to.equal(
        env.bidders[1].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(200n);
    });

    it("5 distinct bidders: winner pays the second-highest price", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 500n); // winner
      await placeBid(env, auctionId, env.bidders[2], 200n);
      await placeBid(env, auctionId, env.bidders[3], 400n); // second
      await placeBid(env, auctionId, env.bidders[4], 300n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(
        env,
        auctionId,
      );

      expect(winner.toLowerCase()).to.equal(
        env.bidders[1].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(400n);
    });

    it("tie at the top: first to bid wins, pays the tie value", async () => {
      // bidder[0] = 500 (first), bidder[1] = 500 (second), bidder[2] = 100
      // expected: winner = bidder[0], secondPrice = 500
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 500n);
      await placeBid(env, auctionId, env.bidders[1], 500n);
      await placeBid(env, auctionId, env.bidders[2], 100n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(
        env,
        auctionId,
      );
      expect(winner.toLowerCase()).to.equal(
        env.bidders[0].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(500n);
    });

    it("triple tie at the top: first to bid wins, pays the tie value", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 500n);
      await placeBid(env, auctionId, env.bidders[1], 500n);
      await placeBid(env, auctionId, env.bidders[2], 500n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(
        env,
        auctionId,
      );
      expect(winner.toLowerCase()).to.equal(
        env.bidders[0].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(500n);
    });

    it("caps a bid that exceeds the collateral", async () => {
      // Use a small collateral (1000 wei) so we can submit a bid that
      // clearly exceeds it (5000) and observe the homomorphic cap.
      const env = await deployVickrey();
      const cap = 1000n;
      const auctionId = await createDefaultAuction(env, {
        collateralAmount: cap,
      });

      // bidder 0 over-bids; its effective bid is capped to `cap`.
      // bidder 1 bids cap (legitimate ceiling).
      // bidder 2 bids 200 (below).
      // Highest after cap: bidder 0 (cap, arrived first) — but bidder 1 ties.
      // First-match wins → bidder 0 wins, second price = cap (tie).
      await placeBid(env, auctionId, env.bidders[0], 5000n, cap);
      await placeBid(env, auctionId, env.bidders[1], cap, cap);
      await placeBid(env, auctionId, env.bidders[2], 200n, cap);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(env, auctionId);
      expect(winner.toLowerCase()).to.equal(
        env.bidders[0].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(cap);
    });

    it("tie at the second place: pays the second value", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 200n);
      await placeBid(env, auctionId, env.bidders[1], 200n);
      await placeBid(env, auctionId, env.bidders[2], 500n); // winner

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);

      const { winner, secondPrice } = await finalizeSettlement(
        env,
        auctionId,
      );
      expect(winner.toLowerCase()).to.equal(
        env.bidders[2].address.toLowerCase(),
      );
      expect(secondPrice).to.equal(200n);
    });
  });

  describe("withdraw", () => {
    it("loser withdraws full collateral, winner withdraws overpayment, seller withdraws second price", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      // winner = bidders[1] @ 300, secondPrice = 200
      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 300n);
      await placeBid(env, auctionId, env.bidders[2], 200n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);
      const { winner, secondPrice } = await finalizeSettlement(env, auctionId);
      expect(secondPrice).to.equal(200n);

      const loserBalBefore = await ethers.provider.getBalance(
        env.bidders[0].address,
      );
      const tx1 = await env.auction
        .connect(env.bidders[0])
        .withdraw(auctionId);
      const r1 = await tx1.wait();
      const loserBalAfter = await ethers.provider.getBalance(
        env.bidders[0].address,
      );
      const gas1 = r1!.gasUsed * r1!.gasPrice;
      expect(loserBalAfter - loserBalBefore + gas1).to.equal(
        DEFAULT_COLLATERAL,
      );

      const winnerSigner = env.bidders[1];
      expect(winner.toLowerCase()).to.equal(
        winnerSigner.address.toLowerCase(),
      );
      const winnerBalBefore = await ethers.provider.getBalance(
        winnerSigner.address,
      );
      const tx2 = await env.auction.connect(winnerSigner).withdraw(auctionId);
      const r2 = await tx2.wait();
      const winnerBalAfter = await ethers.provider.getBalance(
        winnerSigner.address,
      );
      const gas2 = r2!.gasUsed * r2!.gasPrice;
      expect(winnerBalAfter - winnerBalBefore + gas2).to.equal(
        DEFAULT_COLLATERAL - secondPrice,
      );

      const sellerBalBefore = await ethers.provider.getBalance(
        env.seller.address,
      );
      const tx3 = await env.auction.connect(env.seller).withdraw(auctionId);
      const r3 = await tx3.wait();
      const sellerBalAfter = await ethers.provider.getBalance(
        env.seller.address,
      );
      const gas3 = r3!.gasUsed * r3!.gasPrice;
      expect(sellerBalAfter - sellerBalBefore + gas3).to.equal(secondPrice);
    });

    it("rejects double withdraw", async () => {
      const env = await deployVickrey();
      const auctionId = await createDefaultAuction(env);

      await placeBid(env, auctionId, env.bidders[0], 100n);
      await placeBid(env, auctionId, env.bidders[1], 300n);
      await placeBid(env, auctionId, env.bidders[2], 200n);

      await advancePastDeadline(env, auctionId);
      await requestSettlement(env, auctionId);
      await finalizeSettlement(env, auctionId);

      await env.auction.connect(env.bidders[0]).withdraw(auctionId);
      await expect(
        env.auction.connect(env.bidders[0]).withdraw(auctionId),
      ).to.be.revertedWithCustomError(env.auction, "AlreadyWithdrawn");
    });
  });
});
