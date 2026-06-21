# `@fhe-vickrey-auction/nextjs`

Frontend web do **Leilão de Vickrey Confidencial**. Cifra os lances no navegador
com `@cofhe/sdk`, submete-os ao contrato do leilão e orquestra a revelação do
resultado pelo lado do cliente através da Threshold Services Network. Veja o
[README raiz](../../README.md) para a visão geral completa do projeto.

## Stack

- Next.js 16, React 19, TypeScript
- wagmi + viem + RainbowKit (carteira e acesso à chain)
- `@cofhe/sdk` (FHE no cliente: cifração e decifração por *threshold*)
- Zustand (estado), Tailwind CSS + DaisyUI (UI)

## Primeiros passos

A partir da raiz do repositório:

```bash
pnpm install
pnpm start            # servidor de desenvolvimento em http://localhost:3000
```

Ou a partir deste pacote:

```bash
pnpm dev
```

## Configuração

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS=0x...      # contrato do leilão implantado
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

## Estrutura

```
app/                     # App router do Next.js (layout, page, globals)
components/
  ├── vickrey/           # UI do leilão: lista, detalhe, formulário de criação, painel de privacidade, timeline
  ├── Navbar.tsx · Providers.tsx · ThemeToggle.tsx
hooks/                   # useCofhe, useVickreyAuction, usePermit
services/                # cliente cofhe, stores Zustand, config wagmi
utils/                   # ABI do contrato e utilitários de explorador
```

## Licença

MIT
