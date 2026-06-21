"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuctionStore } from "@/services/store/auctionStore";
import { AuctionList } from "./AuctionList";
import { AuctionDetail } from "./AuctionDetail";
import { CreateAuctionForm } from "./CreateAuctionForm";

type View = "list" | "create" | "detail";

export function VickreyPage() {
  const [view, setView] = useState<View>("list");
  const { selectedAuctionId, setSelectedAuctionId } = useAuctionStore();

  const open = (id: bigint) => {
    setSelectedAuctionId(id);
    setView("detail");
  };

  const back = () => {
    setSelectedAuctionId(null);
    setView("list");
  };

  return (
    <div className="flex flex-col gap-6">
      {view === "list" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display uppercase tracking-wider text-base-content/70">
              Leilões abertos
            </h2>
            <button
              onClick={() => setView("create")}
              className="btn-fhenix px-4 py-2 rounded-sm font-display uppercase tracking-wider text-xs font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Novo leilão
            </button>
          </div>
          <AuctionList onOpen={open} />
        </>
      )}

      {view === "create" && (
        <CreateAuctionForm
          onCreated={(id) => open(id)}
          onCancel={back}
        />
      )}

      {view === "detail" && selectedAuctionId !== null && (
        <AuctionDetail auctionId={selectedAuctionId} onBack={back} />
      )}
    </div>
  );
}
