"use client";

import { useEffect, useState } from "react";
import { useAuctionStore } from "@/services/store/auctionStore";
import { useVickreyAuction } from "@/hooks/useVickreyAuction";
import { AuctionData } from "@/utils/vickreyAuction";
import { AuctionCard } from "./AuctionCard";

interface Props {
  onOpen: (id: bigint) => void;
}

export function AuctionList({ onOpen }: Props) {
  const { listAuctions } = useVickreyAuction();
  const refreshTrigger = useAuctionStore((s) => s.refreshTrigger);
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAuctions().then((list) => {
      if (cancelled) return;
      setAuctions(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listAuctions, refreshTrigger]);

  if (loading) {
    return (
      <div className="text-base-content/60 text-sm">Carregando leilões…</div>
    );
  }

  if (auctions.length === 0) {
    return (
      <div className="border border-dashed border-base-300 rounded-sm p-10 text-center text-base-content/60">
        Nenhum leilão ainda. Seja o primeiro a criar um.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {auctions.map((a) => (
        <AuctionCard key={a.id.toString()} auction={a} onOpen={onOpen} />
      ))}
    </div>
  );
}
