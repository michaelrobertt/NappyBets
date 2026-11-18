# Nappy Bets

Aplicativo desktop para Windows 10/11 criado para registrar previsões esportivas, acompanhar a qualidade das análises e controlar a banca de forma manual. O foco principal são **League of Legends** e **CS2**, com outras modalidades disponíveis como registro secundário.

O Nappy Bets **não executa apostas**, não movimenta dinheiro real e não se conecta a contas de casas de apostas. Tudo fica em um banco SQLite local.

## Recursos

- Registro de previsões com modalidade, competição, time/jogador, evento, mercado, resultado previsto e probabilidade estimada.
- **Brier Score**, taxa de acerto, calibração por faixas de probabilidade, destaques positivos/negativos e linha do tempo.
- **Banca completa**: valor inicial, stake e odds por aposta, depósitos, saques, exposição em aberto, lucro/prejuízo, ROI e gráfico de evolução.
- Cálculo automático de retorno e P&L quando o resultado é atualizado.
- Histórico com filtros, busca, edição em lote, detalhes e exportação.
- **Mercados externos** da Polymarket e da Kalshi em modo somente leitura: clique em um resultado para abrir uma nova previsão já preenchida e revise antes de salvar.
- Dados de demonstração para explorar o aplicativo, removíveis a qualquer momento.
- Backup automático, restauração, exportação/importação JSON e CSV.

## Como a banca funciona

- **Banca total** = banca inicial + depósitos − saques + lucro realizado.
- **Banca disponível** = banca total − stakes de apostas pendentes.
- **Acertou**: lucro de `stake × (odds − 1)`.
- **Errou**: prejuízo de `−stake`.
- **Anulada**: sem lucro ou prejuízo.
- **ROI**: lucro realizado ÷ stakes concluídas.

O gráfico mostra o saldo realizado por dia e marca depósitos e saques. Apostas pendentes aparecem separadas como exposição, sem antecipar lucro.

Previsões antigas ou de demonstração podem não ter valor financeiro. Elas continuam contando para Brier Score e taxa de acerto, mas só entram na banca depois que você informa stake e odds.

## Mercados externos

A integração com **Polymarket** e **Kalshi** usa apenas endpoints públicos de leitura. Nenhuma carteira, chave privada, API key de conta ou posição pessoal é conectada.

Os mercados servem como catálogo para preencher uma aposta manual. A probabilidade implícita do mercado é apenas um ponto de partida; ajuste para a sua confiança antes de salvar.

## Privacidade e dados

- Banco local em `%APPDATA%\NappyBets\nappybets.sqlite`.
- Cópias de segurança na pasta `backups`.
- Nenhum envio de previsões, banca ou perfil para servidores do Nappy Bets.
- O aplicativo não executa ordens, não movimenta valores e não acessa contas de apostas.

## Tecnologia

- Electron 45
- React 19 + TypeScript
- Vite 6
- SQLite via `sql.js`
- Vitest
- electron-builder (instalador NSIS para Windows x64)

## Desenvolvimento

Requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Comandos úteis:

```bash
npm run typecheck   # verificação de tipos
npm test            # testes automatizados
npm run build       # build do renderer e do processo principal
npm run dist        # gera o instalador em release/
```

O instalador é criado em:

```text
release/NappyBets-Setup-1.0.0.exe
```

## Estrutura

```text
electron/           processo principal, persistência, IPC e integração externa
src/shared/         tipos, estatística, banca, CSV e contratos IPC
src/renderer/       interface React (páginas, componentes, estilos)
tests/              testes de estatística, banca, armazenamento e integração
build/              ícones do aplicativo e do instalador
```

## Testes

A suíte cobre cálculos estatísticos, Brier Score, calibração, banca, migração de schema, CSV/JSON, persistência e normalização dos mercados externos.

```text
61 testes · 6 arquivos
```

## Aviso

Este é um aplicativo de registro e análise pessoal. Ele não garante resultados, não é aconselhamento financeiro e não incentiva apostas. Use com responsabilidade.
