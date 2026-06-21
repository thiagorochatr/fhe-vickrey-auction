# Leilão de Vickrey Confidencial com FHE

> Artefato prático do Trabalho de Conclusão de Curso (TCC) *"Leilão de Vickrey
> Confidencial com FHE em Blockchain Pública"*, de **Thiago Rocha Duarte**
> (CEFET-RJ, Sistemas de Informação, 2026). Este repositório contém **apenas o
> código**; o texto acadêmico é publicado separadamente.

Um leilão de **Vickrey** (lance selado, segundo preço) confidencial em blockchain
pública, construído sobre a [Fhenix CoFHE](https://www.fhenix.io/) usando
*Fully Homomorphic Encryption* (FHE). Os lances são cifrados no cliente e
permanecem cifrados durante todo o leilão. O vencedor e o preço são computados
homomorficamente; apenas o **segundo maior lance** (o preço pago) e a
**identidade do vencedor** são revelados no fechamento. Todo lance perdedor
permanece cifrado para sempre.

O caso de uso é a alocação primária de **ativos do mundo real (RWA)**
tokenizados: investidores institucionais precificam um ativo sem revelar suas
valorações aos concorrentes. Neste protótipo, uma única unidade é leiloada e o
token de RWA é simulado (*mock*).

## Funcionalidades

- **Lances cifrados ponta a ponta**: os lances são *ciphertexts* `euint64`;
  ninguém (nem o contrato, nem o vendedor) vê o valor de um lance.
- **Vickrey verdadeiro (segundo preço)**: o vencedor paga o segundo maior lance,
  preservando a propriedade de *truthfulness* do mecanismo.
- **Problema da exclusão resolvido sob FHE**: o segundo maior lance é computado
  sem decifrar o vencedor, usando uma máscara homomórfica e uma redução *top-2*
  incremental.
- **Desempate determinístico**: empates no topo são resolvidos por ordem de
  chegada (a desigualdade estrita do `FHE.gt` mantém o primeiro a lançar), sem
  estrutura adicional.
- **Colateral em ETH**: cada lance deposita um colateral uniforme que também
  limita o lance máximo válido; perdedores resgatam o colateral, e o vencedor
  resgata o excedente.
- **Fechamento orquestrado pelo cliente**: não há *callback* de oráculo on-chain.
  O contrato marca os *handles* do resultado como publicamente decifráveis; o
  cliente lê o texto claro da Threshold Services Network e o publica de volta,
  onde o contrato o verifica com `FHE.verifyDecryptResult`.

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                          │
│   RainbowKit + wagmi/viem  ·  @cofhe/sdk (FHE no cliente)           │
│   Cifra os lances no navegador · consulta a TSN para revelar       │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│            ConfidentialVickreyAuction.sol  (contrato único)        │
│   lances euint64 · top-2 incremental · máscara de exclusão ·       │
│   vencedor eaddress · colateral em ETH · fechamento em 2 etapas    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Rede Fhenix (CoFHE)                          │
│   Coprocessador off-chain para operações FHE · Threshold Services  │
│   Network (decifração por threshold, consultada pelo cliente)      │
└──────────────────────────────────────────────────────────────────┘
```

## Ciclo de vida do leilão

1. **Criar**: o vendedor chama `createAuction(name, itemId, collateral, start, end)`.
2. **Lançar**: cada participante cifra um lance no navegador e chama `bid(auctionId, encryptedAmount)` enviando exatamente o colateral. O contrato atualiza o *top-2* cifrado de forma incremental. O fechamento exige pelo menos `MIN_BIDDERS` (3) lances.
3. **Solicitar fechamento**: após o prazo, qualquer um chama `requestSettlement(auctionId)`, que marca o vencedor e o segundo preço como publicamente decifráveis.
4. **Revelar (off-chain)**: o cliente lê o vencedor e o segundo preço da Threshold Services Network via `@cofhe/sdk`.
5. **Finalizar**: qualquer um publica o texto claro de volta com `finalizeSettlement(auctionId, winner, secondPrice, winnerProof, secondPriceProof)`; o contrato o verifica contra os *handles* cifrados antes de fechar.
6. **Sacar**: perdedores sacam o colateral integral, o vencedor saca o excedente e o vendedor recebe o segundo preço, via `withdraw(auctionId)`.

## Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Contrato | Solidity 0.8.25, Hardhat, `@fhenixprotocol/cofhe-contracts` (evmVersion `cancun`) |
| Cliente FHE | `@cofhe/sdk` |
| Testes FHE | `@cofhe/hardhat-plugin`, `@cofhe/mock-contracts` |
| Frontend | Next.js 16, React 19, TypeScript |
| Web3 | wagmi, viem, RainbowKit, TanStack Query |
| Estado / UI | Zustand, Tailwind CSS, DaisyUI |
| Gerenciador de pacotes | pnpm (monorepo) |

## Estrutura do projeto

```
.
├── packages/
│   ├── hardhat/                        # Contrato, testes e deploy
│   │   ├── contracts/
│   │   │   └── ConfidentialVickreyAuction.sol
│   │   ├── test/                        # Testes unitários + benchmark de gás (mock CoFHE)
│   │   ├── deploy/                      # Script de deploy
│   │   ├── scripts/                     # Benchmark em testnet + utilitários
│   │   └── tasks/                       # Tarefas Hardhat (verificação)
│   └── nextjs/                          # Frontend
│       ├── app/                         # App router do Next.js
│       ├── components/vickrey/          # UI do leilão (lista, detalhe, criação, painel de privacidade)
│       ├── hooks/                       # useCofhe, useVickreyAuction, usePermit
│       ├── services/                    # cliente cofhe, stores, config wagmi
│       └── utils/                       # ABIs e utilitários de explorador
└── dados/                               # Conjuntos de dados de benchmark (mock + testnet, CSV)
```

## Primeiros passos

### Pré-requisitos

- Node.js >= 20.18.3
- pnpm 9.x

### Instalação

```bash
pnpm install
```

### Rodar os testes (mock CoFHE, sem rede, sem custo)

```bash
pnpm test
```

A suíte completa roda sobre o mock CoFHE local e cobre lances válidos e
inválidos, fechamento antes do prazo, lance duplo, cálculo correto do vencedor e
do segundo preço, tratamento de empate e recuperação do colateral, além de um
benchmark de gás para `N ∈ {3, 5, 10}` participantes.

### Frontend local

```bash
pnpm start            # sobe o servidor de desenvolvimento Next.js em http://localhost:3000
```

### Deploy em testnet pública

```bash
# defina PRIVATE_KEY em packages/hardhat/.env (veja .example.env)
pnpm deploy --network arb-sepolia
```

## Scripts disponíveis (raiz)

| Comando | Descrição |
|---------|-----------|
| `pnpm test` | Roda a suíte de testes do contrato (mock CoFHE) |
| `pnpm compile` | Compila o contrato |
| `pnpm deploy` | Faz deploy com hardhat-deploy |
| `pnpm verify` | Verifica o contrato no explorador de blocos |
| `pnpm start` | Sobe o servidor de desenvolvimento do frontend |
| `pnpm next:build` | Compila o frontend para produção |

## API do contrato (`ConfidentialVickreyAuction`)

| Função | Descrição |
|--------|-----------|
| `createAuction(name, itemId, collateralAmount, startTime, endTime)` | Cria um leilão; `itemId` referencia o item de RWA (simulado) |
| `bid(auctionId, encryptedAmount)` *(payable)* | Submete um lance cifrado; deve enviar exatamente `collateralAmount` |
| `requestSettlement(auctionId)` | Após o prazo, marca vencedor e segundo preço como publicamente decifráveis |
| `finalizeSettlement(auctionId, winner, secondPrice, winnerProof, secondPriceProof)` | Publica o resultado decifrado; verificado contra os *handles* cifrados |
| `withdraw(auctionId)` | Perdedores resgatam o colateral; vencedor resgata o excedente; vendedor recebe o segundo preço |
| `cancelAuction(auctionId)` | Vendedor cancela um leilão sem fechamento |
| `getAuction` / `getSettlementResult` / `getSettlementCtHashes` / `getBidderEncryptedBid` | Consultas (*views*) |

## Como a FHE viabiliza o Vickrey

Computar o segundo maior lance exige excluir o vencedor antes do segundo máximo,
o que em texto claro é trivial, mas sob FHE não se pode olhar quem venceu. O
contrato mantém um *top-2* cifrado (`highestBid`, `secondHighestBid`) e o
atualiza a cada lance com `FHE.gt`/`FHE.select`, de modo que o segundo preço
emerge sem nunca decifrar um lance perdedor. Como o `FHE.gt` é uma desigualdade
estrita, lances iguais no topo são resolvidos por ordem de chegada, sem lógica
adicional. A autorização para ler um valor privado (por exemplo, um participante
consultar o próprio lance) é tratada por *permits*; já revelar o vencedor e o
segundo preço dispensa *permit*, pois o contrato torna esses dois *handles*
públicos em `requestSettlement`.

## Variáveis de ambiente

**Frontend** (`packages/nextjs/.env.local`):

```env
NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

**Contrato** (`packages/hardhat/.env`, veja `.example.env`):

```env
PRIVATE_KEY=               # chave do deployer, sem 0x
ARBITRUM_SEPOLIA_RPC_URL=  # opcional; usa um endpoint público se vazio
```

## Redes

- **Local**: Hardhat com o mock CoFHE (desenvolvimento e testes).
- **Testnet**: Arbitrum Sepolia (`arb-sepolia`, chainId 421614), onde a CoFHE
  está ativa. Um deploy de referência está em
  `0x1eEa76147cBCD878D1cb5B8fdCb6bd0Ed836D811`.

## Licença

MIT
