"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { AuctionStatus } from "@/utils/vickreyAuction";

interface Props {
  status: AuctionStatus;
  totalBids: bigint;
}

interface Item {
  label: string;
  detail?: string;
}

const VISIBILITY: Record<
  AuctionStatus,
  { visible: Item[]; hidden: Item[]; note?: string }
> = {
  [AuctionStatus.Active]: {
    visible: [
      { label: "Número de lances", detail: "Contador on-chain." },
      { label: "Endereço de cada participante", detail: "Quem assina a transação `bid` é público." },
      { label: "Colateral depositado", detail: "O msg.value é texto claro." },
    ],
    hidden: [
      {
        label: "Valor de cada lance",
        detail:
          "Cada lance é cifrado no seu navegador com TFHE antes do envio. Apenas os handles de ciphertext ficam on-chain.",
      },
      { label: "Quem está liderando", detail: "O maior lance é um eaddress cifrado." },
      { label: "Os dois maiores lances", detail: "Mantidos incrementalmente como euint64 via FHE.gt/FHE.select." },
    ],
    note: "Enquanto o leilão está aberto, o contrato calcula os dois maiores lances sobre ciphertexts sem aprender nenhum texto claro.",
  },
  [AuctionStatus.SettlementRequested]: {
    visible: [
      {
        label: "Dois handles de ciphertext",
        detail:
          "winnerCtHash e secondPriceCtHash, marcados como publicamente decifráveis.",
      },
      { label: "Número de lances, endereços, estado" },
    ],
    hidden: [
      {
        label: "Vencedor e segundo preço em texto claro",
        detail:
          "Só serão revelados depois que a Threshold Network assinar o texto claro.",
      },
      { label: "Todos os valores dos lances perdedores", detail: "Nunca marcados para decifração." },
    ],
    note:
      "Qualquer um pode consultar os dois ciphertexts na TSN. O contrato só aceita os textos claros de volta se as assinaturas baterem com os mesmos handles.",
  },
  [AuctionStatus.Settled]: {
    visible: [
      { label: "Endereço do vencedor" },
      { label: "Segundo maior lance (o preço pago)" },
      { label: "Número de lances e lista de participantes" },
    ],
    hidden: [
      {
        label: "O lance do próprio vencedor",
        detail:
          "Só o preço que ele pagará (= segundo maior lance) é revelado; a disposição máxima real de pagar permanece selada.",
      },
      {
        label: "Todos os valores dos lances perdedores",
        detail: "Seus ciphertexts euint64 permanecem on-chain para sempre, indecifráveis.",
      },
    ],
  },
  [AuctionStatus.Cancelled]: {
    visible: [{ label: "Número de lances, estado, endereços" }],
    hidden: [{ label: "Valor de cada lance", detail: "O leilão nunca foi liquidado." }],
  },
};

export function PrivacyPanel({ status, totalBids }: Props) {
  const conf = VISIBILITY[status];
  const losersHidden =
    status === AuctionStatus.Settled && totalBids > 1n ? totalBids - 1n : 0n;

  return (
    <div className="border border-base-300 rounded-sm bg-base-200/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-base-content/60">
        <Info className="w-3 h-3" />
        O que este estado revela
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Column
          icon={<Eye className="w-3 h-3" />}
          title="Visível na blockchain"
          items={conf.visible}
          tone="visible"
        />
        <Column
          icon={<EyeOff className="w-3 h-3" />}
          title="Oculto"
          items={conf.hidden}
          tone="hidden"
        />
      </div>

      {losersHidden > 0n && (
        <p className="text-xs text-base-content/60 italic">
          {losersHidden.toString()}{" "}
          {losersHidden === 1n ? "lance perdedor permanece" : "lances perdedores permanecem"} cifrados
          on-chain para sempre. Seus valores nunca foram acessados pelo contrato,
          pelo coprocessador ou por qualquer participante.
        </p>
      )}

      {conf.note && (
        <p className="text-xs text-base-content/60">{conf.note}</p>
      )}
    </div>
  );
}

function Column({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: Item[];
  tone: "visible" | "hidden";
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex items-center gap-1 text-xs uppercase tracking-wider ${
          tone === "visible" ? "text-warning" : "text-success"
        }`}
      >
        {icon} {title}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-sm">
            <span className="text-base-content">{it.label}</span>
            {it.detail && (
              <span className="block text-xs text-base-content/50">
                {it.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
