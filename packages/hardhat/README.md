# `@fhe-vickrey-auction/hardhat`

Contrato Solidity, testes e deploy do **Leilão de Vickrey Confidencial**. O
contrato executa um leilão de lance selado e segundo preço (Vickrey) sobre
lances cifrados usando a [Fhenix CoFHE](https://www.fhenix.io/). Veja o
[README raiz](../../README.md) para a visão geral completa do projeto.

## Stack

- Solidity 0.8.25, `evmVersion: cancun`
- Hardhat + `hardhat-deploy`
- `@fhenixprotocol/cofhe-contracts` (tipos cifrados e operações FHE)
- `@cofhe/hardhat-plugin` + `@cofhe/mock-contracts` (rodam a suíte completa sobre
  um mock CoFHE local, sem rede e sem custo de gás)

## Estrutura

```
contracts/
  └── ConfidentialVickreyAuction.sol   # o contrato do leilão
test/
  ├── ConfidentialVickreyAuction.test.ts   # 20 testes unitários (mock CoFHE)
  ├── GasBenchmark.ts                       # benchmark de gás; escreve ../../dados/benchmarks-mock.csv
  └── helpers/vickreySetup.ts               # fixtures de teste compartilhados
deploy/
  └── 02_deploy_vickrey.ts             # script hardhat-deploy
scripts/                              # benchmark em testnet + utilitários de deploy
tasks/                                # tarefas Hardhat (verificação do contrato)
```

## Scripts

```bash
pnpm compile        # compila o contrato
pnpm test           # roda a suíte de testes sobre o mock CoFHE
pnpm deploy         # faz deploy com hardhat-deploy (use --network arb-sepolia para testnet)
pnpm verify         # verifica o contrato no explorador de blocos
```

> Rodar `pnpm test` executa o `GasBenchmark.ts`, que regenera
> `../../dados/benchmarks-mock.csv`.

## Configuração

Copie `.example.env` para `.env` e preencha:

```env
PRIVATE_KEY=               # chave do deployer, sem 0x (use uma carteira só de testnet)
SEPOLIA_RPC_URL=           # opcional
ARBITRUM_SEPOLIA_RPC_URL=  # opcional; usa um endpoint público se vazio
```

Redes configuradas: `eth-sepolia` e `arb-sepolia` (chainId 421614, onde a CoFHE
está ativa). O desenvolvimento local usa a rede Hardhat com o mock CoFHE.

## Licença

MIT
