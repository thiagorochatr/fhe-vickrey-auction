/**
 * Type definitions, ABI and helpers for the ConfidentialVickreyAuction
 * contract.
 */

// ============ Status enum ============

export enum AuctionStatus {
  Active = 0,
  SettlementRequested = 1,
  Settled = 2,
  Cancelled = 3,
}

export function statusLabel(s: AuctionStatus): string {
  switch (s) {
    case AuctionStatus.Active:
      return "Ativo";
    case AuctionStatus.SettlementRequested:
      return "Liquidação solicitada";
    case AuctionStatus.Settled:
      return "Liquidado";
    case AuctionStatus.Cancelled:
      return "Cancelado";
  }
}

export function statusBadgeClass(s: AuctionStatus): string {
  switch (s) {
    case AuctionStatus.Active:
      return "badge-success";
    case AuctionStatus.SettlementRequested:
      return "badge-warning";
    case AuctionStatus.Settled:
      return "badge-info";
    case AuctionStatus.Cancelled:
      return "badge-error";
  }
}

// ============ Data types ============

export interface AuctionData {
  id: bigint;
  name: string;
  seller: `0x${string}`;
  itemId: bigint;
  collateralAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  status: AuctionStatus;
  totalBids: bigint;
}

export interface SettlementResult {
  winner: `0x${string}`;
  secondPrice: bigint;
}

// ============ Address resolution ============

export function getAuctionContractAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS;
  if (!addr) {
    throw new Error(
      "Missing NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS — set it in packages/nextjs/.env.local",
    );
  }
  if (!addr.startsWith("0x") || addr.length !== 42) {
    throw new Error(
      `Invalid NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS: ${addr}`,
    );
  }
  return addr as `0x${string}`;
}

// ============ ABI (generated from artifact) ============

export const vickreyAuctionAbi = [
  { inputs: [], name: "AlreadyBid", type: "error" },
  { inputs: [], name: "AlreadyWithdrawn", type: "error" },
  { inputs: [], name: "AuctionEnded", type: "error" },
  { inputs: [], name: "AuctionNotActive", type: "error" },
  { inputs: [], name: "AuctionNotEnded", type: "error" },
  { inputs: [], name: "InsufficientBidders", type: "error" },
  { inputs: [], name: "InvalidDecryptionProof", type: "error" },
  {
    inputs: [
      { internalType: "uint8", name: "got", type: "uint8" },
      { internalType: "uint8", name: "expected", type: "uint8" },
    ],
    name: "InvalidEncryptedInput",
    type: "error",
  },
  { inputs: [], name: "InvalidTimeRange", type: "error" },
  { inputs: [], name: "NameRequired", type: "error" },
  { inputs: [], name: "NameTooLong", type: "error" },
  { inputs: [], name: "NotEligible", type: "error" },
  { inputs: [], name: "NotSeller", type: "error" },
  { inputs: [], name: "SellerCannotBid", type: "error" },
  { inputs: [], name: "SettlementNotRequested", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "WinnerCannotPay", type: "error" },
  { inputs: [], name: "WrongCollateral", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
    ],
    name: "AuctionCancelled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "uint256", name: "itemId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "collateralAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "startTime", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "endTime", type: "uint256" },
    ],
    name: "AuctionCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "winner", type: "address" },
      { indexed: false, internalType: "uint64", name: "secondPrice", type: "uint64" },
    ],
    name: "AuctionSettled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bidder", type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "BidPlaced",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
      { indexed: false, internalType: "bytes32", name: "winnerCtHash", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "secondPriceCtHash", type: "bytes32" },
    ],
    name: "SettlementRequested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "auctionId", type: "uint256" },
      { indexed: true, internalType: "address", name: "account", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Withdrawn",
    type: "event",
  },
  {
    inputs: [],
    name: "MIN_BIDDERS",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "auctionId", type: "uint256" },
      {
        components: [
          { internalType: "uint256", name: "ctHash", type: "uint256" },
          { internalType: "uint8", name: "securityZone", type: "uint8" },
          { internalType: "uint8", name: "utype", type: "uint8" },
          { internalType: "bytes", name: "signature", type: "bytes" },
        ],
        internalType: "struct InEuint64",
        name: "encryptedAmount",
        type: "tuple",
      },
    ],
    name: "bid",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "cancelAuction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "collateral",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "itemId", type: "uint256" },
      { internalType: "uint256", name: "collateralAmount", type: "uint256" },
      { internalType: "uint256", name: "startTime", type: "uint256" },
      { internalType: "uint256", name: "endTime", type: "uint256" },
    ],
    name: "createAuction",
    outputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "auctionId", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "uint64", name: "secondPrice", type: "uint64" },
      { internalType: "bytes", name: "winnerProof", type: "bytes" },
      { internalType: "bytes", name: "secondPriceProof", type: "bytes" },
    ],
    name: "finalizeSettlement",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "getAuction",
    outputs: [
      {
        components: [
          { internalType: "string", name: "name", type: "string" },
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "uint256", name: "itemId", type: "uint256" },
          { internalType: "uint256", name: "collateralAmount", type: "uint256" },
          { internalType: "uint256", name: "startTime", type: "uint256" },
          { internalType: "uint256", name: "endTime", type: "uint256" },
          { internalType: "uint8", name: "status", type: "uint8" },
          { internalType: "uint256", name: "totalBids", type: "uint256" },
        ],
        internalType: "struct ConfidentialVickreyAuction.AuctionView",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "getSettlementCtHashes",
    outputs: [
      { internalType: "bytes32", name: "winnerCt", type: "bytes32" },
      { internalType: "bytes32", name: "secondPriceCt", type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "getSettlementResult",
    outputs: [
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "uint64", name: "secondPrice", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "hasBid",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "hasWithdrawn",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextAuctionId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "requestSettlement",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
