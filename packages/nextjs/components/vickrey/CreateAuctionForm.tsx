"use client";

import { useState } from "react";
import { parseEther } from "viem";
import toast from "react-hot-toast";
import { useVickreyAuction } from "@/hooks/useVickreyAuction";

interface Props {
  onCreated: (id: bigint) => void;
  onCancel: () => void;
}

export function CreateAuctionForm({ onCreated, onCancel }: Props) {
  const { createAuction, isLoading } = useVickreyAuction();
  const [name, setName] = useState("");
  const [itemId, setItemId] = useState("1");
  const [collateral, setCollateral] = useState("0.01"); // ETH
  const [startInMin, setStartInMin] = useState("0");
  const [durationMin, setDurationMin] = useState("10");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let collateralWei: bigint;
    try {
      collateralWei = parseEther(collateral.replace(",", ".").trim());
    } catch {
      toast.error(`Colateral inválido: "${collateral}". Use um decimal como 0.01.`);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const start = BigInt(now + Number(startInMin) * 60);
    const end = start + BigInt(Number(durationMin) * 60);
    const id = await createAuction({
      name: name.trim(),
      itemId: BigInt(itemId),
      collateralAmount: collateralWei,
      startTime: start,
      endTime: end,
    });
    if (id !== null) onCreated(id);
  };

  return (
    <form
      onSubmit={submit}
      className="bg-base-100 border border-base-300 rounded-sm p-6 flex flex-col gap-4"
    >
      <h2 className="text-2xl font-bold font-display uppercase">
        Criar Leilão
      </h2>

      <Field label="Nome" hint="Máx. 32 caracteres">
        <input
          required
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input input-bordered w-full"
          placeholder="ex.: Lote A · Recebíveis Q3"
        />
      </Field>

      <Field
        label="ID do item"
        hint="Identificador do ativo leiloado (uint256, mock). Em um caso de uso de RWA, referenciaria o token do ativo do mundo real, por exemplo uma fração de recebíveis tokenizados."
      >
        <input
          required
          type="number"
          min="0"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="input input-bordered w-full font-mono"
        />
      </Field>

      <Field
        label="Colateral por lance (ETH)"
        hint="Todo participante deposita exatamente este valor. Define o teto público dos lances."
      >
        <input
          required
          type="number"
          step="any"
          min="0"
          value={collateral}
          onChange={(e) => setCollateral(e.target.value)}
          className="input input-bordered w-full font-mono"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Início em (minutos)" hint="Use 0 para começar imediatamente.">
          <input
            required
            type="number"
            min="0"
            value={startInMin}
            onChange={(e) => setStartInMin(e.target.value)}
            className="input input-bordered w-full font-mono"
          />
        </Field>
        <Field label="Duração (minutos)">
          <input
            required
            type="number"
            min="1"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            className="input input-bordered w-full font-mono"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="btn-fhenix px-6 py-2 rounded-sm font-display uppercase tracking-wider"
        >
          {isLoading ? "Enviando…" : "Criar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost"
          disabled={isLoading}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-base-content/60">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-base-content/40">{hint}</span> : null}
    </label>
  );
}
