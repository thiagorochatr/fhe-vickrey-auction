"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import toast from "react-hot-toast";
import { EncryptStep } from "@cofhe/sdk";
import {
  ArrowLeft,
  Lock,
  Clock,
  Users,
  Trophy,
  Wallet,
  Gavel,
  Hash,
} from "lucide-react";
import {
  AuctionData,
  AuctionStatus,
  SettlementResult,
  statusBadgeClass,
  statusLabel,
} from "@/utils/vickreyAuction";
import { useVickreyAuction } from "@/hooks/useVickreyAuction";
import { useAuctionStore } from "@/services/store/auctionStore";
import { useCofhe } from "@/hooks/useCofhe";
import { PrivacyPanel } from "./PrivacyPanel";
import { StepTimeline, Step, StepState } from "./StepTimeline";

interface Props {
  auctionId: bigint;
  onBack: () => void;
}

export function AuctionDetail({ auctionId, onBack }: Props) {
  const { address } = useAccount();
  const { isInitialized: cofheReady } = useCofhe();
  const {
    getAuction,
    getSettlementResult,
    getSettlementCtHashes,
    hasBid,
    hasWithdrawn,
    placeBid,
    requestSettlement,
    finalizeSettlement,
    withdraw,
    cancelAuction,
    isLoading,
  } = useVickreyAuction();
  const refreshTrigger = useAuctionStore((s) => s.refreshTrigger);

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [didBid, setDidBid] = useState(false);
  const [didWithdraw, setDidWithdraw] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [ctHashes, setCtHashes] = useState<{
    winnerCt: `0x${string}`;
    secondPriceCt: `0x${string}`;
  } | null>(null);

  // Refetch on mount and whenever something triggers a refresh.
  useEffect(() => {
    let cancelled = false;
    const refetch = async () => {
      const a = await getAuction(auctionId);
      if (cancelled) return;
      setAuction(a);
      if (a?.status === AuctionStatus.Settled) {
        const s = await getSettlementResult(auctionId);
        if (!cancelled) setSettlement(s);
      }
      if (
        a?.status === AuctionStatus.SettlementRequested ||
        a?.status === AuctionStatus.Settled
      ) {
        const cts = await getSettlementCtHashes(auctionId);
        if (!cancelled) setCtHashes(cts);
      }
      if (address) {
        const [b, w] = await Promise.all([
          hasBid(auctionId, address),
          hasWithdrawn(auctionId, address),
        ]);
        if (!cancelled) {
          setDidBid(b);
          setDidWithdraw(w);
        }
      }
    };
    refetch();
    return () => {
      cancelled = true;
    };
  }, [
    auctionId,
    address,
    refreshTrigger,
    getAuction,
    getSettlementResult,
    getSettlementCtHashes,
    hasBid,
    hasWithdrawn,
  ]);

  // Tick the clock once per second for UX (start/end countdowns).
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!auction) {
    return (
      <div className="text-base-content/60 text-sm">
        Carregando leilão #{auctionId.toString()}…
      </div>
    );
  }

  const isSeller =
    address && address.toLowerCase() === auction.seller.toLowerCase();
  const isWinner =
    settlement &&
    address &&
    address.toLowerCase() === settlement.winner.toLowerCase();

  const startsIn = Number(auction.startTime) - now;
  const endsIn = Number(auction.endTime) - now;
  const beforeStart = startsIn > 0;
  const inBidWindow = !beforeStart && endsIn > 0;
  const pastDeadline = endsIn <= 0;

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-base-content/60 hover:text-base-content w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar à lista
      </button>

      <div className="bg-base-100 border border-base-300 rounded-sm p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-base-content/50 font-mono">
              Leilão #{auction.id.toString()}
            </span>
            <h2 className="text-3xl font-bold tracking-tight">
              {auction.name}
            </h2>
          </div>
          <span
            className={`badge ${statusBadgeClass(auction.status)} text-xs uppercase tracking-wider`}
          >
            {statusLabel(auction.status)}
          </span>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat icon={<Lock className="w-3 h-3" />} label="Item">
            <span className="font-mono">#{auction.itemId.toString()}</span>
          </Stat>
          <Stat icon={<Wallet className="w-3 h-3" />} label="Colateral">
            <span className="font-mono">
              {formatEther(auction.collateralAmount)} ETH
            </span>
          </Stat>
          <Stat icon={<Users className="w-3 h-3" />} label="Lances">
            <span className="font-mono">{auction.totalBids.toString()}</span>
          </Stat>
          <Stat icon={<Clock className="w-3 h-3" />} label="Tempo">
            <span className="font-mono">
              {beforeStart
                ? `Começa em ${formatDuration(startsIn)}`
                : inBidWindow
                  ? `Termina em ${formatDuration(endsIn)}`
                  : "Encerrado"}
            </span>
          </Stat>
        </div>

        {/* Privacy panel */}
        <PrivacyPanel status={auction.status} totalBids={auction.totalBids} />

        {/* Action panel */}
        <div className="border-t border-base-300 pt-6">
          {auction.status === AuctionStatus.Active && inBidWindow && (
            isSeller ? (
              <BoxPanel title="Você é o vendedor">
                <p className="text-sm text-base-content/60">
                  Vendedores não podem dar lances no próprio leilão. Isso protege
                  a propriedade de truthfulness do leilão de Vickrey, impedindo o
                  shill bidding. Troque de carteira para participar.
                </p>
              </BoxPanel>
            ) : (
              <BidPanel
                cofheReady={cofheReady}
                auction={auction}
                didBid={didBid}
                isLoading={isLoading}
                onBid={(amount, callbacks) =>
                  placeBid(auctionId, amount, auction.collateralAmount, callbacks)
                }
              />
            )
          )}

          {auction.status === AuctionStatus.Active && pastDeadline && (
            <BoxPanel title="Período de lances encerrado">
              {Number(auction.totalBids) < 3 ? (
                <p className="text-sm text-base-content/60">
                  Apenas {auction.totalBids.toString()} lances recebidos. O
                  leilão precisa de pelo menos 3 participantes para ser liquidado.
                  {isSeller && Number(auction.totalBids) === 0 ? (
                    <>
                      {" "}
                      Você pode cancelar (não há nada a reembolsar).
                      <div className="mt-3">
                        <button
                          className="btn btn-error btn-sm"
                          disabled={isLoading}
                          onClick={() => cancelAuction(auctionId)}
                        >
                          Cancelar leilão
                        </button>
                      </div>
                    </>
                  ) : null}
                </p>
              ) : (
                <>
                  <p className="text-sm text-base-content/60 mb-3">
                    Qualquer um pode solicitar a liquidação agora. O contrato vai
                    marcar dois ciphertexts como publicamente decifráveis: o
                    endereço do vencedor e o valor do segundo maior lance. Nada além disso.
                  </p>
                  <button
                    className="btn-fhenix px-4 py-2 rounded-sm uppercase tracking-wider text-xs font-bold font-display"
                    disabled={isLoading}
                    onClick={() => requestSettlement(auctionId)}
                  >
                    <Gavel className="w-3 h-3 inline mr-1" />
                    Solicitar liquidação
                  </button>
                </>
              )}
            </BoxPanel>
          )}

          {auction.status === AuctionStatus.SettlementRequested && (
            <SettlementRequestedPanel
              ctHashes={ctHashes}
              cofheReady={cofheReady}
              isLoading={isLoading}
              onFinalize={(callbacks) => finalizeSettlement(auctionId, callbacks)}
            />
          )}

          {auction.status === AuctionStatus.Settled && settlement && (
            <SettledPanel
              auction={auction}
              settlement={settlement}
              ctHashes={ctHashes}
              isWinner={!!isWinner}
              isSeller={!!isSeller}
              didBid={didBid}
              didWithdraw={didWithdraw}
              onWithdraw={() => withdraw(auctionId)}
              isLoading={isLoading}
            />
          )}

          {auction.status === AuctionStatus.Cancelled && (
            <BoxPanel title="Cancelado">
              {didBid && !didWithdraw && (
                <button
                  className="btn-fhenix px-4 py-2 rounded-sm uppercase tracking-wider text-xs font-bold font-display"
                  disabled={isLoading}
                  onClick={() => withdraw(auctionId)}
                >
                  Sacar o colateral
                </button>
              )}
              {didWithdraw && (
                <p className="text-sm text-base-content/60">
                  Você já sacou.
                </p>
              )}
            </BoxPanel>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Sub-panels ============

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-base-content/50 flex items-center gap-1 text-xs uppercase tracking-wider">
        {icon} {label}
      </span>
      {children}
    </div>
  );
}

function BoxPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-display uppercase tracking-wider text-base-content/70 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

const ENCRYPT_STEPS_ORDER: { step: EncryptStep; label: string; detail: string }[] = [
  {
    step: "init-tfhe" as EncryptStep,
    label: "Inicializar o TFHE (WASM)",
    detail: "Carrega a biblioteca TFHE dentro do navegador.",
  },
  {
    step: "fetch-keys" as EncryptStep,
    label: "Buscar a chave pública FHE + CRS",
    detail: "Fica em cache local após a primeira execução.",
  },
  {
    step: "pack" as EncryptStep,
    label: "Empacotar o valor como entrada cifrável",
    detail: "Adapta o uint64 ao formato do TFHE.",
  },
  {
    step: "prove" as EncryptStep,
    label: "Gerar a prova ZK de boa-formação",
    detail:
      "Prova que o ciphertext codifica um uint64 ≤ 2⁶⁴ − 1 sem revelá-lo.",
  },
  {
    step: "verify" as EncryptStep,
    label: "Verificar a prova com o CoFHE",
    detail: "Retorna o handle canônico do ciphertext.",
  },
];

function BidPanel({
  cofheReady,
  auction,
  didBid,
  onBid,
  isLoading,
}: {
  cofheReady: boolean;
  auction: AuctionData;
  didBid: boolean;
  onBid: (
    amount: bigint,
    callbacks?: {
      onEncryptStep?: (step: EncryptStep) => void;
      onEncrypted?: (ctHash: bigint) => void;
      onSubmit?: () => void;
    },
  ) => Promise<boolean>;
  isLoading: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [currentStep, setCurrentStep] = useState<EncryptStep | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ctHash, setCtHash] = useState<bigint | null>(null);

  const timeline = useMemo<Step[]>(() => {
    const order = ENCRYPT_STEPS_ORDER;
    const currentIdx = currentStep
      ? order.findIndex((s) => s.step === currentStep)
      : -1;
    return order.map((entry, i) => {
      let state: StepState = "pending";
      if (currentIdx === -1 && ctHash !== null) state = "done";
      else if (currentIdx === -1) state = "pending";
      else if (i < currentIdx) state = "done";
      else if (i === currentIdx) state = "active";
      return { key: entry.step, label: entry.label, detail: entry.detail, state };
    });
  }, [currentStep, ctHash]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    // Normalize Portuguese-style comma decimals before parsing.
    const normalized = amount.replace(",", ".").trim();
    let amountWei: bigint;
    try {
      amountWei = parseEther(normalized);
    } catch {
      toast.error(`Valor de lance inválido: "${amount}". Use um decimal como 0.005.`);
      return;
    }
    if (amountWei < 0n) {
      toast.error("O lance não pode ser negativo.");
      return;
    }
    if (amountWei > auction.collateralAmount) {
      toast.error(
        `O lance não pode exceder o colateral (${formatEther(auction.collateralAmount)} ETH). O contrato o truncaria de qualquer forma.`,
      );
      return;
    }
    setCtHash(null);
    setCurrentStep(null);
    setSubmitting(false);
    await onBid(amountWei, {
      onEncryptStep: (step) => setCurrentStep(step),
      onEncrypted: (h) => {
        setCurrentStep(null);
        setCtHash(h);
      },
      onSubmit: () => setSubmitting(true),
    });
    setSubmitting(false);
    setAmount("");
  };

  if (didBid) {
    return (
      <BoxPanel title="Lance recebido">
        <p className="text-sm text-base-content/60">
          Você já deu um lance neste leilão. Cada endereço pode dar um lance só.
          Seu ciphertext está on-chain; apenas você (com um permit) pode decifrá-lo
          de volta para texto claro.
        </p>
      </BoxPanel>
    );
  }

  const encrypting = currentStep !== null;
  const hasCt = ctHash !== null;

  return (
    <BoxPanel title="Dar um lance">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-base-content/60">
            Valor do lance (ETH)
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ex.: 0.005"
            disabled={encrypting || submitting}
            className="input input-bordered w-full font-mono"
          />
          <span className="text-xs text-base-content/40">
            Este valor em texto claro <strong>nunca</strong> chega à blockchain.
            Ele é cifrado no seu navegador; apenas um handle de ciphertext chega.
            Seu colateral ({formatEther(auction.collateralAmount)} ETH) fica
            travado até a liquidação e define o teto do lance (o contrato trunca
            qualquer valor acima disso).
          </span>
        </label>

        <button
          type="submit"
          disabled={isLoading || !cofheReady || !amount}
          className="btn-fhenix px-4 py-2 rounded-sm uppercase tracking-wider text-xs font-bold font-display w-fit"
        >
          {!cofheReady
            ? "Conecte a carteira"
            : encrypting
              ? "Cifrando…"
              : submitting
                ? "Enviando tx…"
                : "Cifrar e dar lance"}
        </button>

        {(encrypting || hasCt || submitting) && (
          <StepTimeline
            title="Cifração no navegador (TFHE/WASM)"
            steps={timeline}
          />
        )}

        {hasCt && (
          <div className="border border-base-300 rounded-sm p-3 bg-base-200/40 flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-base-content/60 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Handle do ciphertext indo para a blockchain
            </span>
            <code className="text-xs font-mono break-all text-base-content">
              0x{ctHash!.toString(16).padStart(64, "0")}
            </code>
            <span className="text-xs text-base-content/50">
              O texto claro <code className="font-mono">{amount || "?"} ETH</code>{" "}
              <strong>não</strong> está na transação; apenas este handle mais
              uma prova ZK de boa-formação.
            </span>
          </div>
        )}
      </form>
    </BoxPanel>
  );
}

function SettlementRequestedPanel({
  ctHashes,
  cofheReady,
  isLoading,
  onFinalize,
}: {
  ctHashes: { winnerCt: `0x${string}`; secondPriceCt: `0x${string}` } | null;
  cofheReady: boolean;
  isLoading: boolean;
  onFinalize: (callbacks: {
    onStep: (
      step: "fetchHandles" | "decryptTSN" | "submitOnchain" | "done",
    ) => void;
    onDecrypted: (winner: `0x${string}`, secondPrice: bigint) => void;
  }) => Promise<boolean>;
}) {
  const [currentStep, setCurrentStep] = useState<
    "fetchHandles" | "decryptTSN" | "submitOnchain" | "done" | null
  >(null);
  const [decrypted, setDecrypted] = useState<{
    winner: `0x${string}`;
    secondPrice: bigint;
  } | null>(null);

  const timeline = useMemo<Step[]>(() => {
    const order = [
      {
        key: "fetchHandles",
        label: "Ler os handles cifrados do contrato",
        detail: "Chama getSettlementCtHashes(auctionId).",
      },
      {
        key: "decryptTSN",
        label: "Decifrar via Threshold Services Network",
        detail:
          "As partes do quórum cooperam para recuperar o texto claro + assinatura.",
      },
      {
        key: "submitOnchain",
        label: "Publicar o texto claro on-chain com finalizeSettlement",
        detail:
          "O contrato verifica via FHE.verifyDecryptResult contra cada handle.",
      },
    ];
    const idx = currentStep
      ? order.findIndex((s) => s.key === currentStep)
      : -1;
    return order.map((s, i) => {
      let state: StepState = "pending";
      if (currentStep === "done") state = "done";
      else if (idx === -1) state = "pending";
      else if (i < idx) state = "done";
      else if (i === idx) state = "active";
      return { ...s, state };
    });
  }, [currentStep]);

  return (
    <BoxPanel title="Aguardando finalização">
      <p className="text-sm text-base-content/60 mb-3">
        O contrato marcou exatamente dois ciphertexts como publicamente
        decifráveis: o endereço do vencedor e o segundo maior lance. Qualquer um
        pode consultá-los na Threshold Services Network e publicar o texto claro
        de volta on-chain.
      </p>

      {ctHashes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <CtHashCard label="winnerCtHash (eaddress)" value={ctHashes.winnerCt} />
          <CtHashCard
            label="secondPriceCtHash (euint64)"
            value={ctHashes.secondPriceCt}
          />
        </div>
      )}

      <button
        className="btn-fhenix px-4 py-2 rounded-sm uppercase tracking-wider text-xs font-bold font-display"
        disabled={isLoading || !cofheReady}
        onClick={() =>
          onFinalize({
            onStep: (s) => setCurrentStep(s),
            onDecrypted: (winner, secondPrice) =>
              setDecrypted({ winner, secondPrice }),
          })
        }
      >
        {cofheReady ? "Finalizar liquidação" : "Conecte a carteira primeiro"}
      </button>

      {currentStep !== null && (
        <div className="mt-3">
          <StepTimeline title="Fluxo de revelação" steps={timeline} />
        </div>
      )}

      {decrypted && (
        <div className="mt-3 border border-base-300 rounded-sm p-3 bg-base-200/40 text-sm flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-base-content/60">
            Decifrado (sendo publicado)
          </span>
          <span>
            Vencedor: <code className="font-mono">{decrypted.winner}</code>
          </span>
          <span>
            Segundo preço:{" "}
            <code className="font-mono">
              {formatEther(decrypted.secondPrice)} ETH
            </code>
          </span>
        </div>
      )}
    </BoxPanel>
  );
}

function SettledPanel({
  auction,
  settlement,
  ctHashes,
  isWinner,
  isSeller,
  didBid,
  didWithdraw,
  onWithdraw,
  isLoading,
}: {
  auction: AuctionData;
  settlement: SettlementResult;
  ctHashes: { winnerCt: `0x${string}`; secondPriceCt: `0x${string}` } | null;
  isWinner: boolean;
  isSeller: boolean;
  didBid: boolean;
  didWithdraw: boolean;
  onWithdraw: () => void;
  isLoading: boolean;
}) {
  let myAction: { label: string; description: string } | null = null;
  if (isSeller) {
    myAction = {
      label: "Sacar o segundo preço",
      description: `${formatEther(settlement.secondPrice)} ETH`,
    };
  } else if (isWinner) {
    const refund = auction.collateralAmount - BigInt(settlement.secondPrice);
    myAction = {
      label: "Sacar o troco",
      description: `${formatEther(refund)} ETH (colateral − segundo preço)`,
    };
  } else if (didBid) {
    myAction = {
      label: "Sacar o colateral",
      description: `${formatEther(auction.collateralAmount)} ETH`,
    };
  }

  return (
    <BoxPanel title="Resultado">
      <div className="flex items-center gap-3 mb-4">
        <Trophy className="w-5 h-5 text-primary" />
        <div className="text-sm">
          <p className="text-base-content/60">Vencedor</p>
          <p className="font-mono break-all">{settlement.winner}</p>
        </div>
      </div>
      <div className="mb-4 text-sm">
        <p className="text-base-content/60">Preço pago (segundo maior lance)</p>
        <p className="font-mono text-lg">
          {formatEther(settlement.secondPrice)} ETH
        </p>
      </div>

      {ctHashes && (
        <details className="mb-4 border border-base-300 rounded-sm bg-base-200/40">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-base-content/60 p-3">
            Handles decifrados (para auditabilidade)
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 pt-0">
            <CtHashCard
              label="winnerCtHash → endereço do vencedor"
              value={ctHashes.winnerCt}
            />
            <CtHashCard
              label="secondPriceCtHash → segundo preço"
              value={ctHashes.secondPriceCt}
            />
          </div>
        </details>
      )}

      {myAction ? (
        didWithdraw ? (
          <p className="text-sm text-base-content/60">
            Você já sacou.
          </p>
        ) : (
          <button
            className="btn-fhenix px-4 py-2 rounded-sm uppercase tracking-wider text-xs font-bold font-display"
            disabled={isLoading}
            onClick={onWithdraw}
          >
            {myAction.label}{" "}
            <span className="text-base-content/60 ml-2">
              ({myAction.description})
            </span>
          </button>
        )
      ) : (
        <p className="text-sm text-base-content/60">
          Você não participou deste leilão.
        </p>
      )}
    </BoxPanel>
  );
}

function CtHashCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-base-300 rounded-sm p-3 bg-base-100">
      <span className="text-xs uppercase tracking-wider text-base-content/60 flex items-center gap-1">
        <Hash className="w-3 h-3" /> {label}
      </span>
      <code className="text-xs font-mono break-all block mt-1 text-base-content/80">
        {value}
      </code>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
