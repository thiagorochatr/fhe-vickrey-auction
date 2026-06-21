"use client";

import { Lock, Clock, Users } from "lucide-react";
import { formatEther } from "viem";
import {
  AuctionData,
  statusBadgeClass,
  statusLabel,
} from "@/utils/vickreyAuction";

interface Props {
  auction: AuctionData;
  onOpen: (id: bigint) => void;
}

export function AuctionCard({ auction, onOpen }: Props) {
  const now = Math.floor(Date.now() / 1000);
  const endsIn = Number(auction.endTime) - now;
  const endsLabel =
    endsIn <= 0
      ? "Encerrado"
      : endsIn < 60
        ? `${endsIn}s`
        : endsIn < 3600
          ? `${Math.round(endsIn / 60)}m`
          : endsIn < 86400
            ? `${Math.round(endsIn / 3600)}h`
            : `${Math.round(endsIn / 86400)}d`;

  return (
    <button
      onClick={() => onOpen(auction.id)}
      className="text-left bg-base-100 border border-base-300 rounded-sm p-5 hover:border-primary transition-colors flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-base-content/50 font-mono">
            #{auction.id.toString()}
          </span>
          <h3 className="text-lg font-bold tracking-tight">{auction.name}</h3>
        </div>
        <span
          className={`badge ${statusBadgeClass(auction.status)} text-xs uppercase tracking-wider`}
        >
          {statusLabel(auction.status)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-base-content/50 flex items-center gap-1 text-xs">
            <Lock className="w-3 h-3" /> Item
          </span>
          <span className="font-mono">#{auction.itemId.toString()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-base-content/50 flex items-center gap-1 text-xs">
            <Clock className="w-3 h-3" /> Termina em
          </span>
          <span className="font-mono">{endsLabel}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-base-content/50 flex items-center gap-1 text-xs">
            <Users className="w-3 h-3" /> Lances
          </span>
          <span className="font-mono">{auction.totalBids.toString()}</span>
        </div>
      </div>

      <div className="text-xs text-base-content/60">
        Colateral:{" "}
        <span className="font-mono text-base-content">
          {formatEther(auction.collateralAmount)} ETH
        </span>
      </div>
    </button>
  );
}
