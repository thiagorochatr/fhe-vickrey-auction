# Manual de execução

Guia passo a passo para rodar o **Leilão de Vickrey Confidencial com FHE** do
zero, sem conhecimento prévio do projeto. Para a visão geral, a arquitetura e a
API do contrato, veja o [README](README.md).

O projeto tem dois caminhos de execução, independentes entre si:

- **Caminho A (testes locais).** Roda a suíte de testes inteira na sua máquina,
  sobre um *mock* da Fhenix CoFHE. Não exige carteira, internet, ETH nem deploy.
  É a forma mais rápida de confirmar que tudo funciona. **Comece por aqui.**
- **Caminho B (aplicação completa na testnet).** Sobe a interface web e executa
  um leilão de ponta a ponta na rede de testes Arbitrum Sepolia. Exige carteira,
  ETH de testnet e um contrato implantado. É o que demonstra o fluxo real.

> A computação homomórfica no navegador depende do coprocessador real da Fhenix
> CoFHE, que vive na testnet. Por isso o Caminho B usa a Arbitrum Sepolia, e não
> uma blockchain local. A blockchain local serve apenas aos testes (Caminho A),
> que usam o *mock*.

---

## 1. Pré-requisitos

Instale, na sua máquina:

| Ferramenta | Versão mínima | Como verificar |
|------------|---------------|----------------|
| [Node.js](https://nodejs.org/) | 20.18.3 | `node -v` |
| [pnpm](https://pnpm.io/installation) | 9.x | `pnpm -v` |
| [Git](https://git-scm.com/) | qualquer recente | `git --version` |

Para o **Caminho B** você também precisa de uma carteira de navegador, por
exemplo a [MetaMask](https://metamask.io/).

> Se não tiver o pnpm, instale com `npm install -g pnpm` (precisa do Node antes).

---

## 2. Clonar e instalar

```bash
git clone https://github.com/thiagorochatr/fhe-vickrey-auction.git
cd fhe-vickrey-auction
pnpm install
```

O `pnpm install` instala as dependências dos dois pacotes do monorepo
(`packages/hardhat` e `packages/nextjs`) de uma vez.

---

## 3. Caminho A: rodar os testes (local, sem custo)

Na raiz do projeto:

```bash
pnpm test
```

Isso compila o contrato e executa a suíte completa sobre o *mock* da CoFHE. Você
deve ver algo como:

```
  ConfidentialVickreyAuction
    ✔ creates an auction in Active status ...
    ✔ 3 distinct bidders: winner pays the second-highest price ...
    ✔ tie at the top: first to bid wins ...
  GasBenchmark
    ✔ runs N ∈ {3, 5, 10} with 5 reps each and writes CSV
  21 passing
```

A suíte cobre os cenários exigidos pelo trabalho: lance válido e inválido,
fechamento antes do prazo, lance duplo, cálculo correto do vencedor e do segundo
preço, tratamento de empate e recuperação do colateral. O bloco `GasBenchmark`
mede o gás por operação e regenera o arquivo `dados/benchmarks-mock.csv`.

Comandos relacionados (todos a partir da raiz):

```bash
pnpm compile        # apenas compila o contrato
pnpm hardhat:test   # equivalente a pnpm test
```

> Se o terminal mostrar avisos do compilador sobre `MockTaskManager.sol`, ignore:
> são avisos das bibliotecas de *mock* da CoFHE, não do contrato deste projeto.

---

## 4. Caminho B: aplicação completa na testnet

Aqui você sobe a interface web e roda um leilão real na Arbitrum Sepolia.

### 4.1. Preparar a carteira

1. Instale a [MetaMask](https://metamask.io/) no navegador.
2. Adicione a rede **Arbitrum Sepolia** (a MetaMask costuma oferecer adicioná-la
   automaticamente ao conectar; se precisar adicionar à mão, use estes dados):
   - **Nome:** Arbitrum Sepolia
   - **ID da cadeia (chainId):** `421614`
   - **RPC:** `https://arbitrum-sepolia.publicnode.com`
   - **Símbolo:** ETH
   - **Explorador:** `https://sepolia.arbiscan.io`
3. Obtenha **ETH de testnet** na Arbitrum Sepolia (é gratuito e não tem valor
   real). Use qualquer *faucet* de Arbitrum Sepolia (por exemplo, os faucets da
   Alchemy ou da QuickNode), ou obtenha ETH de Sepolia e transfira para a
   Arbitrum Sepolia pela [ponte oficial da Arbitrum](https://bridge.arbitrum.io).

> Para demonstrar o leilão de ponta a ponta você precisa de **pelo menos 3
> participantes distintos**, pois o contrato exige no mínimo 3 lances para
> fechar (`MIN_BIDDERS = 3`). Tenha 3 ou mais carteiras, cada uma com um pouco de
> ETH de testnet.

### 4.2. Configurar as variáveis de ambiente

O frontend lê duas variáveis. Crie o arquivo `packages/nextjs/.env.local` a
partir do exemplo:

```bash
cp packages/nextjs/.env.example packages/nextjs/.env.local
```

Edite `packages/nextjs/.env.local`:

```env
# Endereço do contrato do leilão na Arbitrum Sepolia.
# Use o deploy de referência abaixo, ou implante o seu (seção 5).
NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS=0x1eEa76147cBCD878D1cb5B8fdCb6bd0Ed836D811

# ID de projeto do WalletConnect (https://cloud.walletconnect.com).
# Opcional para uso local; melhora a conexão de carteiras móveis.
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=seu_project_id
```

O endereço `0x1eEa76147cBCD878D1cb5B8fdCb6bd0Ed836D811` é um **deploy de
referência** já existente na Arbitrum Sepolia. Você pode usá-lo direto para
testar, ou implantar o seu próprio contrato (seção 5) e colocar o endereço dele
aqui.

### 4.3. Subir o frontend

Na raiz do projeto:

```bash
pnpm start
```

Abra [http://localhost:3000](http://localhost:3000) no navegador. Clique em
conectar carteira e selecione a MetaMask na rede Arbitrum Sepolia.

### 4.4. Executar um leilão pela interface

A interface segue o ciclo de vida do mecanismo. Com a carteira conectada:

1. **Criar um leilão.** Em "Leilões abertos", clique em **Novo leilão**.
   Preencha nome, identificador do item (o ativo de RWA, simulado), valor do
   colateral e os horários de início e fim. Confirme a transação na carteira. O
   colateral define também o teto de um lance válido.
2. **Lançar (cifrado).** Abra o leilão na lista. Cada participante, com sua
   própria carteira, informa um valor de lance; o navegador **cifra o lance**
   localmente (essa etapa leva alguns segundos, por causa do custo do TFHE) e
   envia a transação `bid`, depositando exatamente o colateral. Repita com pelo
   menos 3 carteiras distintas. Nenhum lance fica visível para ninguém.
3. **Solicitar fechamento.** Depois que o prazo do leilão terminar, qualquer
   participante clica para **solicitar o fechamento** (`requestSettlement`). Isso
   marca o vencedor e o segundo preço como publicamente decifráveis.
4. **Finalizar (revelar).** Em seguida, a interface consulta a Threshold
   Services Network para decifrar o vencedor e o segundo preço e publica o
   resultado de volta com `finalizeSettlement`. O contrato confere o resultado
   contra os dados cifrados antes de fechar. Ao final, apenas o **segundo maior
   lance** (o preço pago) e a **identidade do vencedor** ficam públicos; todos os
   demais lances permanecem cifrados.
5. **Sacar.** Cada participante clica em **sacar** (`withdraw`): perdedores
   recuperam o colateral integral, o vencedor recupera o excedente sobre o preço
   pago, e o vendedor recebe o segundo preço.

> O painel de privacidade da interface mostra, a cada etapa, o que está cifrado e
> o que foi revelado. Para um participante consultar o **próprio** lance cifrado,
> a interface pede uma assinatura (um *permit*) que autoriza apenas aquela
> carteira a decifrar o próprio valor.

---

## 5. (Opcional) Implantar seu próprio contrato

Se quiser usar um contrato seu em vez do deploy de referência:

1. Configure a chave do *deployer*. Crie `packages/hardhat/.env` a partir do
   exemplo e preencha a chave privada de uma carteira de testnet (com ETH de
   Arbitrum Sepolia):

   ```bash
   cp packages/hardhat/.example.env packages/hardhat/.env
   ```

   ```env
   PRIVATE_KEY=sua_chave_privada_sem_0x
   ARBITRUM_SEPOLIA_RPC_URL=   # opcional; se vazio, usa um endpoint público
   ```

   > Use uma carteira dedicada à testnet. **Nunca** versione o arquivo `.env`
   > (ele já está no `.gitignore`).

2. Faça o deploy:

   ```bash
   pnpm deploy --network arb-sepolia
   ```

   O endereço implantado aparece no terminal. Copie-o para
   `NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS` em `packages/nextjs/.env.local` (seção
   4.2) e reinicie o frontend.

3. (Opcional) Verifique o contrato no explorador de blocos:

   ```bash
   pnpm verify
   ```

---

## 6. Referência de comandos

Todos a partir da raiz do projeto:

| Comando | O que faz |
|---------|-----------|
| `pnpm install` | Instala as dependências dos dois pacotes |
| `pnpm test` | Roda a suíte de testes sobre o *mock* CoFHE |
| `pnpm compile` | Compila o contrato |
| `pnpm deploy --network arb-sepolia` | Implanta o contrato na testnet |
| `pnpm verify` | Verifica o contrato no explorador |
| `pnpm start` | Sobe o frontend em http://localhost:3000 |
| `pnpm next:build` | Compila o frontend para produção |

---

## 7. Solução de problemas

| Sintoma | Causa e solução |
|---------|-----------------|
| `Missing NEXT_PUBLIC_VICKREY_AUCTION_ADDRESS` ao abrir o app | Falta definir o endereço do contrato em `packages/nextjs/.env.local` (seção 4.2). Reinicie o `pnpm start` após editar. |
| Avisos `indexedDB is not defined` ou `@react-native-async-storage/async-storage` no terminal do frontend | São avisos inofensivos das bibliotecas de carteira durante a renderização no servidor. O app funciona normalmente no navegador. |
| A transação de lance falha com erro de colateral | O valor enviado precisa ser **exatamente** o colateral do leilão. A interface usa esse valor automaticamente; se estiver chamando o contrato direto, envie `collateralAmount`. |
| Não consigo fechar o leilão | O fechamento só é permitido **após o prazo** e com **pelo menos 3 lances**. Verifique a data de término e o número de participantes. |
| A cifração do lance demora alguns segundos | Esperado: a cifração TFHE acontece no navegador e tem custo computacional inerente. |
| MetaMask reclama da estimativa de taxa na Arbitrum Sepolia | O endpoint público oficial às vezes tem respostas instáveis. O projeto já usa um RPC alternativo (`arbitrum-sepolia.publicnode.com`); se persistir, troque o RPC da rede na carteira. |
| `pnpm test` alterou `dados/benchmarks-mock.csv` | Esperado: o bloco `GasBenchmark` regenera esse arquivo a cada execução. |

---

## 8. Estrutura do projeto

Resumo de onde está cada coisa (detalhes no [README](README.md)):

```
packages/hardhat/    # contrato Solidity, testes, deploy
packages/nextjs/     # interface web (cifração no cliente, fluxo do leilão)
dados/               # conjuntos de dados de benchmark (mock + testnet, CSV)
```
