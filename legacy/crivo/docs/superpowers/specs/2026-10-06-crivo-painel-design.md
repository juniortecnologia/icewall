# Crivo — painel dos dois portões (etapa 1: interface com dados de mentira)

Data: 2026-10-06 · Status: aprovado em conversa, aguardando revisão da spec

## Objetivo

O Crivo é um painel com dois portões que filtram o Claude Code enquanto ele trabalha em outro projeto:

- **Portão de entrada:** avalia cada prompt do usuário antes de o Claude ler.
- **Portão de saída:** confere cada comando ou arquivo que o Claude vai mexer contra as regras da casa.

Nesta etapa existe só a interface, com dados de mentira gravados no SQLite. Não há IA e nada está ligado ao Claude Code. Fica pronta a base para a etapa seguinte, em que os ganchos reais só precisam gravar no banco.

## Critérios de sucesso

- `pnpm dev` sobe o painel em `http://localhost:4000`, sempre nessa porta, para conviver com o outro projeto.
- A tela mostra o placar no topo e as duas colunas lado a lado, com cerca de 10 exemplos realistas em cada uma, o mais novo em cima.
- A coluna de entrada tem obrigatoriamente "faz uns relatórios aí" em vermelho e um pedido de relatório bem detalhado em verde.
- O botão "simular" insere um item falso. Ele aparece no topo da coluna e o placar muda sem recarregar a página.
- O rodapé diz se `TYPESAFE_API_KEY` carregou no servidor, sem nunca expor o valor.
- Logo e ícones são SVG escritos à mão no código: sem emoji, sem biblioteca de ícones, sem imagem externa.

## Fora do escopo

- IA, avaliação real de prompts, ganchos do Claude Code.
- Tabela de regras da casa ou tela para editá-las (a regra é só texto no comando).
- Autenticação, deploy, múltiplos projetos monitorados.

## Stack

- Next.js (App Router) com TypeScript e Tailwind.
- SQLite via `better-sqlite3` com SQL à mão, sem ORM. Como o pnpm bloqueia scripts de build por padrão, o build nativo precisa ser liberado na configuração do pnpm.
- Vitest para os testes.
- Gerenciador: `corepack pnpm`.
- Scripts `dev` e `start` fixos em `-p 4000`.

## Estrutura

```
src/app/page.tsx              página inicial; já chega com os dados prontos do servidor
src/app/api/feed/route.ts     GET: devolve os dois feeds e o placar
src/app/api/simular/route.ts  POST: insere um prompt ou comando falso
src/lib/db.ts                 conexão, cria as tabelas e grava os exemplos se o banco estiver vazio
src/lib/exemplos.ts           os ~10 exemplos de cada coluna
src/lib/avaliacao.ts          funções puras: nota → semáforo, placar
src/lib/simulador.ts          sorteia um item falso novo
src/components/               uma peça da tela por arquivo; icones.tsx com todos os SVGs
data/crivo.db                 banco (ignorado pelo git)
.env.local                    TYPESAFE_API_KEY= (vazia, ignorada pelo git)
```

Para facilitar os testes, `db.ts` expõe uma função que recebe o caminho do banco, e os testes passam `:memory:`. A aplicação usa uma conexão única com `data/crivo.db`, criando a pasta se não existir.

## Dados

### Tabela `prompts`

| coluna | tipo | observação |
|---|---|---|
| `id` | integer pk | |
| `texto` | text | o prompt como foi enviado |
| `criado_em` | text ISO | |
| `tamanho` | text | `ajuste`, `funcionalidade` ou `sistema` |
| `tamanho_pct` | integer 0–100 | posição na escala ajuste → sistema inteiro |
| `objetivo_pct` | integer 0–100 | objetivo está claro |
| `onde_pct` | integer 0–100 | diz onde mexer |
| `pronto_pct` | integer 0–100 | diz como saber que ficou pronto |
| `foco_pct` | integer 0–100 | foco num assunto só (baixo = mistura várias coisas) |
| `nota` | integer 0–100 | |
| `semaforo` | text | `verde`, `amarelo` ou `vermelho`, calculado pela nota |

### Tabela `comandos`

| coluna | tipo | observação |
|---|---|---|
| `id` | integer pk | |
| `criado_em` | text ISO | |
| `tipo` | text | `comando` ou `arquivo` |
| `alvo` | text | o comando ou o caminho do arquivo |
| `regra` | text, nulo | a regra da casa que ele bateu; nulo se não bateu nenhuma |
| `semaforo` | text | `liberado` ou `segurado` |

Coerência: todo comando `segurado` tem `regra`. Um comando `liberado` normalmente não tem regra.

### Regras de avaliação (`avaliacao.ts`)

- O semáforo sai da nota: **≥ 70 verde**, **40–69 amarelo**, **< 40 vermelho**. A cor nunca é escolhida à mão, nem nos exemplos.
- As barrinhas medem qualidade (100% = ótimo), com exceção do **tamanho**. Ele mostra uma escala com a classe escrita ao lado e fica em tom de alerta quando a classe é `sistema`.
- Placar, contado no banco inteiro:
  - prompts que passaram (verde)
  - viraram pergunta (amarelo)
  - barrados (vermelho)
  - comandos segurados

### Exemplos (`exemplos.ts`)

- Cerca de 10 prompts e 10 comandos realistas para o contexto de quem desenvolve com Claude Code.
- Obrigatórios na entrada:
  - "faz uns relatórios aí": nota baixa, vermelho.
  - Um pedido de relatório detalhado (objetivo, onde mexer, critério de pronto, um assunto só): verde.
- Mistura de cores na entrada: alguns verdes, alguns amarelos, alguns vermelhos.
- Mistura na saída: comandos e arquivos, liberados e segurados. Exemplos de regras: `rm -rf` fora de /tmp, `git push --force`, mexer em `.env`, `DROP TABLE`, instalar pacote sem pedir.
- Horários espalhados pelos últimos minutos.
- Gravados só quando o banco está vazio (sem duplicar ao reiniciar).

## Fluxo

1. `page.tsx` (servidor) lê os feeds, o placar e o estado da chave, sabendo apenas se `process.env.TYPESAFE_API_KEY` está preenchida. A página chega pronta.
2. Um componente cliente consulta `GET /api/feed` a cada 2 segundos.
   - A resposta traz os 50 itens mais recentes de cada coluna e o placar.
   - A consulta pausa quando a aba está oculta (`visibilitychange`).
3. "Simular" chama `POST /api/simular`.
   - O simulador sorteia entre prompt e comando e monta um item válido a partir de um banco de frases e alvos. A nota do prompt é coerente com os critérios.
   - Grava e devolve o feed atualizado. A tela aplica na hora.

## Tela

- **Topo:**
  - Logo do Crivo em SVG: uma peneira com grade de furos e um traço atravessando.
  - Nome "CRIVO".
  - Indicador "ao vivo" com ponto pulsante. Vira "sem sinal" em âmbar se a consulta falhar.
- **Placar:**
  - Quatro mostradores com número grande em monoespaçada e luz da cor correspondente.
  - passaram (verde) · viraram pergunta (âmbar) · barrados (vermelho) · comandos segurados (vermelho).
- **Colunas:**
  - "Portão de entrada" com ícone de seta entrando, e "Portão de saída" com ícone de seta saindo.
  - Cada coluna rola de forma independente, com o mais novo em cima.
  - Item novo entra com um brilho rápido na borda.
  - Abaixo de `md`, as colunas viram abas.
- **Item de entrada:**
  - **Fechado:**
    - Semáforo vertical de 3 lâmpadas, só a acesa brilha.
    - Prompt em monoespaçada, cortado em 2 linhas.
    - Nota grande à direita e hora.
  - **Aberto, ali mesmo:**
    - Prompt inteiro e as 5 barrinhas segmentadas no estilo de medidor, com a porcentagem e, no tamanho, a classe escrita.
    - Amarelo mostra "o Claude vai perguntar antes de começar". Vermelho mostra "barrado".
  - É um botão acessível (`aria-expanded`).
- **Item de saída:**
  - Semáforo de 2 lâmpadas e ícone de terminal ou de arquivo.
  - Alvo em monoespaçada.
  - Linha da regra batida, ou "nenhuma regra tocada" em tom apagado.
- **Rodapé:**
  - À esquerda: "TypeSafe: chave carregada" ou "TypeSafe: sem chave", discreto, com um ponto de cor.
  - À direita: o botão "simular". Se der erro, aparece uma mensagem curta ao lado.
- **Visual de sala de controle:**
  - Fundo quase preto azulado, painéis com bordas finas e leve brilho de fósforo.
  - JetBrains Mono para prompts, comandos e números. Uma sans condensada para os rótulos.
  - Verde, âmbar e vermelho saturados, com brilho na lâmpada acesa.
  - O semáforo não depende só da cor: cada lâmpada acesa tem forma própria (✓, ?, ✕ desenhados em SVG) e texto acessível.
- **Ícones**, em `icones.tsx`: logo, seta de entrada, seta de saída, terminal, arquivo, marcas das lâmpadas, chave e "simular".

## Erros

- `/api/feed` falha: a tela mantém o que já mostrava, o indicador vira "sem sinal" e volta sozinho na consulta seguinte que der certo.
- `/api/simular` falha: mensagem curta no rodapé, nada quebra.
- Porta 4000 ocupada: o Next falha com erro claro. Não troca de porta.

## Testes

- **Vitest:**
  - Limites do semáforo: 39 vermelho, 40 e 69 amarelo, 70 verde.
  - Contagem do placar.
  - Itens do simulador sempre válidos: porcentagens entre 0 e 100, semáforo coerente com a nota, segurado sempre com regra.
  - Banco em memória: cria as tabelas, grava os exemplos uma vez só e não duplica numa segunda inicialização.
  - Exemplos obrigatórios presentes com as cores certas.
- **Verificação estática:** `tsc --noEmit`, lint e `next build` sem erros.
- **Navegador (google-chrome em :4000):**
  - Placar e duas colunas.
  - Abrir um item de entrada.
  - Simular e ver o item no topo e o placar mudar.
  - Indicador da chave com a variável vazia e preenchida.
  - Largura de celular com abas.

## Git

- Repositório próprio em `/home/junior/Projects/crivo`.
- Trabalho na branch `developer`.
- Mesclar na `main` só com aprovação do usuário. Sem PR e sem push sem pedido.
