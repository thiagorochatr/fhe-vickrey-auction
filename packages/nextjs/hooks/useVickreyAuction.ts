"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Encryptable, EncryptStep, FheTypes } from "@cofhe/sdk";
import { formatEther, parseEventLogs } from "viem";
import toast from "react-hot-toast";
import { cofheClient } from "@/services/cofhe-client";
import { useAuctionStore } from "@/services/store/auctionStore";
import { toastTxSuccess } from "@/utils/explorerLink";
import {
  AuctionData,
  AuctionStatus,
  SettlementResult,
  getAuctionContractAddress,
  vickreyAuctionAbi,
} from "@/utils/vickreyAuction";

/**
 * Returns inflated legacy gas overrides (×2) so the wallet's tx is not
 * rejected by the RPC when the base fee bumps. We use a legacy (type 0)
 * transaction because MetaMask's EIP-1559 estimator on Arbitrum Sepolia
 * tends to override our maxFeePerGas back down to a value lower than the
 * current base fee, causing a near-zero-difference rejection. Sending a
 * legacy tx with a generously inflated `gasPrice` sidesteps that path.
 * Falls back to no overrides if estimation fails.
 */
async function inflatedFees(
  publicClient: ReturnType<typeof usePublicClient>,
): Promise<{ gasPrice?: bigint; type?: "legacy" }> {
  if (!publicClient) return {};
  try {
    const current = await publicClient.getGasPrice();
    return {
      gasPrice: (current * 200n) / 100n,
      type: "legacy",
    };
  } catch {
    return {};
  }
}

/**
 * Centralized client for the ConfidentialVickreyAuction contract.
 * Mirrors the on-chain functions: createAuction, bid, requestSettlement,
 * finalizeSettlement, withdraw, cancelAuction; plus reads.
 */
export function useVickreyAuction() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { setCachedAuction, triggerRefresh } = useAuctionStore();

  const [isLoading, setIsLoading] = useState(false);

  const contract = (): `0x${string}` => getAuctionContractAddress();

  // ============ Reads ============

  const getAuction = useCallback(
    async (auctionId: bigint): Promise<AuctionData | null> => {
      if (!publicClient) return null;
      try {
        const view = (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "getAuction",
          args: [auctionId],
        })) as {
          name: string;
          seller: `0x${string}`;
          itemId: bigint;
          collateralAmount: bigint;
          startTime: bigint;
          endTime: bigint;
          status: number;
          totalBids: bigint;
        };

        const data: AuctionData = {
          id: auctionId,
          name: view.name,
          seller: view.seller,
          itemId: view.itemId,
          collateralAmount: view.collateralAmount,
          startTime: view.startTime,
          endTime: view.endTime,
          status: view.status as AuctionStatus,
          totalBids: view.totalBids,
        };
        setCachedAuction(auctionId, data);
        return data;
      } catch (e) {
        console.error("getAuction failed:", e);
        return null;
      }
    },
    [publicClient, setCachedAuction],
  );

  const getTotalAuctions = useCallback(async (): Promise<bigint> => {
    if (!publicClient) return 0n;
    try {
      return (await publicClient.readContract({
        address: contract(),
        abi: vickreyAuctionAbi,
        functionName: "nextAuctionId",
      })) as bigint;
    } catch (e) {
      console.error("getTotalAuctions failed:", e);
      return 0n;
    }
  }, [publicClient]);

  const listAuctions = useCallback(async (): Promise<AuctionData[]> => {
    const total = await getTotalAuctions();
    const ids: bigint[] = [];
    for (let i = 0n; i < total; i++) ids.push(i);
    const items = await Promise.all(ids.map((id) => getAuction(id)));
    return items.filter((a): a is AuctionData => a !== null);
  }, [getAuction, getTotalAuctions]);

  const hasBid = useCallback(
    async (auctionId: bigint, bidder: `0x${string}`): Promise<boolean> => {
      if (!publicClient) return false;
      try {
        return (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "hasBid",
          args: [auctionId, bidder],
        })) as boolean;
      } catch (e) {
        console.error("hasBid failed:", e);
        return false;
      }
    },
    [publicClient],
  );

  const hasWithdrawn = useCallback(
    async (auctionId: bigint, bidder: `0x${string}`): Promise<boolean> => {
      if (!publicClient) return false;
      try {
        return (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "hasWithdrawn",
          args: [auctionId, bidder],
        })) as boolean;
      } catch (e) {
        return false;
      }
    },
    [publicClient],
  );

  const getCollateral = useCallback(
    async (auctionId: bigint, bidder: `0x${string}`): Promise<bigint> => {
      if (!publicClient) return 0n;
      try {
        return (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "collateral",
          args: [auctionId, bidder],
        })) as bigint;
      } catch (e) {
        return 0n;
      }
    },
    [publicClient],
  );

  const getSettlementResult = useCallback(
    async (auctionId: bigint): Promise<SettlementResult | null> => {
      if (!publicClient) return null;
      try {
        const [winner, secondPrice] = (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "getSettlementResult",
          args: [auctionId],
        })) as [`0x${string}`, bigint];
        return { winner, secondPrice };
      } catch (e) {
        return null;
      }
    },
    [publicClient],
  );

  const getSettlementCtHashes = useCallback(
    async (
      auctionId: bigint,
    ): Promise<{ winnerCt: `0x${string}`; secondPriceCt: `0x${string}` } | null> => {
      if (!publicClient) return null;
      try {
        const [winnerCt, secondPriceCt] = (await publicClient.readContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "getSettlementCtHashes",
          args: [auctionId],
        })) as [`0x${string}`, `0x${string}`];
        return { winnerCt, secondPriceCt };
      } catch (e) {
        return null;
      }
    },
    [publicClient],
  );

  // ============ Writes ============

  const createAuction = useCallback(
    async (args: {
      name: string;
      itemId: bigint;
      collateralAmount: bigint;
      startTime: bigint;
      endTime: bigint;
    }): Promise<bigint | null> => {
      if (!walletClient || !publicClient) {
        toast.error("Carteira não conectada");
        return null;
      }
      setIsLoading(true);
      try {
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "createAuction",
          args: [
            args.name,
            args.itemId,
            args.collateralAmount,
            args.startTime,
            args.endTime,
          ],
          ...fees,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        toastTxSuccess("Leilão criado", hash);

        const logs = parseEventLogs({
          abi: vickreyAuctionAbi,
          logs: receipt.logs,
          eventName: "AuctionCreated",
        });
        const id =
          logs.length > 0 ? (logs[0].args.auctionId as bigint) : null;
        triggerRefresh();
        return id;
      } catch (e: any) {
        console.error("createAuction failed:", e);
        toast.error(e?.shortMessage ?? e?.message ?? "Falha ao criar leilão");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient, walletClient, triggerRefresh],
  );

  const placeBid = useCallback(
    async (
      auctionId: bigint,
      amount: bigint,
      collateral: bigint,
      opts?: {
        onEncryptStep?: (step: EncryptStep) => void;
        onEncrypted?: (ctHash: bigint) => void;
        onSubmit?: () => void;
      },
    ): Promise<boolean> => {
      if (!walletClient || !publicClient || !address) {
        toast.error("Carteira não conectada");
        return false;
      }
      if (!cofheClient.connected) {
        toast.error("Cliente CoFHE ainda não conectado");
        return false;
      }
      setIsLoading(true);
      try {
        const [encryptedBid] = await cofheClient
          .encryptInputs([Encryptable.uint64(amount)])
          .onStep((step) => opts?.onEncryptStep?.(step))
          .execute();
        opts?.onEncrypted?.(encryptedBid.ctHash);

        opts?.onSubmit?.();
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "bid",
          // Cast around the SDK's `signature: string` vs. the ABI's
          // `signature: \`0x${string}\``: at runtime they're the same value;
          // the divergence is a type-level inference artifact.
          args: [auctionId, encryptedBid as never],
          value: collateral,
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        toastTxSuccess("Lance enviado", hash);
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error("placeBid failed:", e);
        toast.error(e?.shortMessage ?? e?.message ?? "Falha ao enviar lance");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient, walletClient, address, triggerRefresh],
  );

  const requestSettlement = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient) {
        toast.error("Carteira não conectada");
        return false;
      }
      setIsLoading(true);
      try {
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "requestSettlement",
          args: [auctionId],
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        toastTxSuccess("Liquidação solicitada", hash);
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error("requestSettlement failed:", e);
        toast.error(
          e?.shortMessage ?? e?.message ?? "Falha ao solicitar liquidação",
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient, walletClient, triggerRefresh],
  );

  const finalizeSettlement = useCallback(
    async (
      auctionId: bigint,
      opts?: {
        onStep?: (
          step: "fetchHandles" | "decryptTSN" | "submitOnchain" | "done",
        ) => void;
        onDecrypted?: (winner: `0x${string}`, secondPrice: bigint) => void;
      },
    ): Promise<boolean> => {
      if (!walletClient || !publicClient) {
        toast.error("Carteira não conectada");
        return false;
      }
      if (!cofheClient.connected) {
        toast.error("Cliente CoFHE ainda não conectado");
        return false;
      }
      setIsLoading(true);
      try {
        opts?.onStep?.("fetchHandles");
        const cts = await getSettlementCtHashes(auctionId);
        if (!cts) throw new Error("Settlement handles not available");

        opts?.onStep?.("decryptTSN");
        const winnerRes = await cofheClient
          .decryptForTx(cts.winnerCt)
          .withoutPermit()
          .execute();
        const secondRes = await cofheClient
          .decryptForTx(cts.secondPriceCt)
          .withoutPermit()
          .execute();

        // The eaddress comes back as a bigint (uint160) → convert to 0x… .
        const winnerAddr =
          ("0x" +
            winnerRes.decryptedValue
              .toString(16)
              .padStart(40, "0")) as `0x${string}`;
        const secondPrice = secondRes.decryptedValue;
        opts?.onDecrypted?.(winnerAddr, secondPrice);

        opts?.onStep?.("submitOnchain");
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "finalizeSettlement",
          args: [
            auctionId,
            winnerAddr,
            secondPrice,
            winnerRes.signature,
            secondRes.signature,
          ],
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        opts?.onStep?.("done");
        toastTxSuccess(`Liquidado: vencedor paga ${formatEther(secondPrice)} ETH`, hash);
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error("finalizeSettlement failed:", e);
        toast.error(
          e?.shortMessage ?? e?.message ?? "Falha ao finalizar liquidação",
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [
      publicClient,
      walletClient,
      getSettlementCtHashes,
      triggerRefresh,
    ],
  );

  const withdraw = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient) {
        toast.error("Carteira não conectada");
        return false;
      }
      setIsLoading(true);
      try {
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "withdraw",
          args: [auctionId],
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        toastTxSuccess("Saque realizado", hash);
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error("withdraw failed:", e);
        toast.error(e?.shortMessage ?? e?.message ?? "Falha ao sacar");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient, walletClient, triggerRefresh],
  );

  const cancelAuction = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !publicClient) {
        toast.error("Carteira não conectada");
        return false;
      }
      setIsLoading(true);
      try {
        const fees = await inflatedFees(publicClient);
        const hash = await walletClient.writeContract({
          address: contract(),
          abi: vickreyAuctionAbi,
          functionName: "cancelAuction",
          args: [auctionId],
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        toastTxSuccess("Leilão cancelado", hash);
        triggerRefresh();
        return true;
      } catch (e: any) {
        console.error("cancelAuction failed:", e);
        toast.error(e?.shortMessage ?? e?.message ?? "Falha ao cancelar leilão");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient, walletClient, triggerRefresh],
  );

  return {
    isLoading,
    // reads
    getAuction,
    getTotalAuctions,
    listAuctions,
    hasBid,
    hasWithdrawn,
    getCollateral,
    getSettlementResult,
    getSettlementCtHashes,
    // writes
    createAuction,
    placeBid,
    requestSettlement,
    finalizeSettlement,
    withdraw,
    cancelAuction,
  };
}
