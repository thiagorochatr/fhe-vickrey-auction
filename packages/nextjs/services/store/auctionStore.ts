import { create } from "zustand";
import { AuctionData } from "@/utils/vickreyAuction";

interface AuctionStore {
  selectedAuctionId: bigint | null;
  setSelectedAuctionId: (id: bigint | null) => void;

  // Cached auctions for quick navigation back and forth.
  cachedAuctions: Map<string, AuctionData>;
  setCachedAuction: (id: bigint, auction: AuctionData) => void;
  getCachedAuction: (id: bigint) => AuctionData | undefined;
  clearCache: () => void;

  isLoadingAuctions: boolean;
  setIsLoadingAuctions: (loading: boolean) => void;

  // Refresh trigger: increment to force lists/details to refetch.
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const useAuctionStore = create<AuctionStore>((set, get) => ({
  selectedAuctionId: null,
  setSelectedAuctionId: (id) => set({ selectedAuctionId: id }),

  cachedAuctions: new Map<string, AuctionData>(),
  setCachedAuction: (id, auction) =>
    set((state) => {
      const next = new Map(state.cachedAuctions);
      next.set(id.toString(), auction);
      return { cachedAuctions: next };
    }),
  getCachedAuction: (id) => get().cachedAuctions.get(id.toString()),
  clearCache: () => set({ cachedAuctions: new Map<string, AuctionData>() }),

  isLoadingAuctions: false,
  setIsLoadingAuctions: (loading) => set({ isLoadingAuctions: loading }),

  refreshTrigger: 0,
  triggerRefresh: () =>
    set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));
