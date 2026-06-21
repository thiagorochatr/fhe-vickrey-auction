"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia, sepolia, hardhat } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Confidential Vickrey Auction",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-project-id",
  // Arbitrum Sepolia first so it is the default when no wallet is connected
  // (reads like nextAuctionId on the landing page run against this chain).
  // Hardhat is kept as a fallback for future local development.
  chains: [arbitrumSepolia, sepolia, hardhat],
  // Customize transports to use more reliable RPCs (the Arbitrum Sepolia
  // official endpoint has flaky feeHistory responses that confuse MetaMask's
  // EIP-1559 estimator).
  transports: {
    [hardhat.id]: http(),
    [arbitrumSepolia.id]: http("https://arbitrum-sepolia.publicnode.com"),
    [sepolia.id]: http("https://ethereum-sepolia.publicnode.com"),
  },
  ssr: true,
});
