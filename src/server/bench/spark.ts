import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { shellArg } from "../spark/ssh";

// Bancada do Spark: os scripts de bench/spark rodam dentro do Spark (127.0.0.1, sem a rede no TTFT).
// Uma combinação diz quais serviços vLLM sobem; um cenário diz qual script mede o quê.

export const SPARK_BENCH_DIR = path.join(process.cwd(), "bench", "spark");
export const COMBINACOES_DIR = path.join(SPARK_BENCH_DIR, "combinacoes");
/** Pasta no Spark para onde os scripts são copiados antes de cada rodada. */
export const PASTA_REMOTA = "~/icewall-bench";

const ARG = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,40}$/;

const servicoSchema = z.object({
  container: z.string().regex(/^glis-[a-z]+$/),
  script: z.string().regex(/^serve-[a-z]+\.sh$/),
  args: z.array(z.string().regex(ARG)).max(8).default([]),
});

const combinacaoSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string(),
  servicos: z.array(servicoSchema).min(1),
  gate: z.boolean().default(false),
});

export type Servico = z.infer<typeof servicoSchema>;
export type Combinacao = z.infer<typeof combinacaoSchema> & { id: string };

export function lerCombinacoes(dir = COMBINACOES_DIR): Combinacao[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const id = f.slice(0, -".json".length);
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`nome de combinação inválido: ${f}`);
      return { id, ...combinacaoSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) };
    });
}

interface Cenario {
  titulo: string;
  script: string;
  args: string[];
  /** Containers que precisam estar na combinação. */
  precisa: string[];
  timeoutS: number;
}

export const CENARIOS = {
  carga: {
    titulo: "Rajada do chat: 1, 4, 7 e 10 chegando no mesmo segundo (prompts RAG ~6k tokens; pior caso)",
    script: "bench_oai.py",
    args: ["--port", "8000", "--model", "chat", "--conc", "1", "4", "7", "10"],
    precisa: ["glis-chat"],
    timeoutS: 1800,
  },
  "carga-real": {
    titulo: "Carga realista do chat: 7 pessoas, uma pergunta a cada 20–40 s cada, por 5 min (critério do RNF-01)",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300"],
    precisa: ["glis-chat"],
    timeoutS: 900,
  },
  "convivencia-real-sem-codigo": {
    titulo: "Carga realista + imagens em fila + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--img", "30", "--rag"],
    precisa: ["glis-chat", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real-sem-codigo-gate-img": {
    titulo: "Carga realista + imagens que esperam o chat ficar livre + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--img", "30", "--gate-img", "--rag"],
    precisa: ["glis-chat", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real": {
    titulo: "Carga realista + agente de código + imagens em fila + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--code", "--img", "30", "--rag"],
    precisa: ["glis-chat", "glis-code", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real-gate-img": {
    titulo: "Carga realista + agente de código + imagens que esperam o chat ficar livre + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--code", "--img", "30", "--gate-img", "--rag"],
    precisa: ["glis-chat", "glis-code", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real-agente-longo": {
    titulo: "Carga realista + agente com contexto longo (~18k tokens) + imagens em fila + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--code", "--code-chars", "60000", "--img", "30", "--rag"],
    precisa: ["glis-chat", "glis-code", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real-agente-no-chat": {
    titulo: "Carga realista + agente no próprio chat (prioridade menor) + imagens em fila + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--code", "--code-port", "8000", "--code-model", "chat", "--code-priority", "10", "--img", "30", "--rag"],
    precisa: ["glis-chat", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "convivencia-real-agente-no-chat-longo": {
    titulo: "Carga realista + agente no próprio chat com contexto longo (~18k tokens, prioridade menor) + imagens + embed/rerank",
    script: "carga_real.py",
    args: ["--users", "7", "--dur", "300", "--code", "--code-port", "8000", "--code-model", "chat", "--code-priority", "10", "--code-chars", "60000", "--img", "30", "--rag"],
    precisa: ["glis-chat", "glis-embed", "glis-rerank"],
    timeoutS: 1200,
  },
  "rag-qualidade": {
    titulo: "Qualidade de RAG em PT-BR: 10 perguntas, 2 armadilhas",
    script: "qual_rag.py",
    args: ["8000", "chat"],
    precisa: ["glis-chat"],
    timeoutS: 900,
  },
  "contexto-longo": {
    titulo: "Contexto longo: ~17k, ~34k e ~57k tokens, frio e com cache",
    script: "ctx_test.py",
    args: ["8000", "chat"],
    precisa: ["glis-chat"],
    timeoutS: 1800,
  },
  imagem: {
    titulo: "Imagem sozinha: 4 fotos de produto (FLUX.2 klein 4B, 4 passos)",
    script: "stress.py",
    args: ["img", "4"],
    precisa: [],
    timeoutS: 900,
  },
  "convivencia-sem-codigo": {
    titulo: "7 chats + imagens + embed/rerank ao mesmo tempo",
    script: "stress.py",
    args: ["all", "img+rag"],
    precisa: ["glis-chat", "glis-embed", "glis-rerank"],
    timeoutS: 1800,
  },
  convivencia: {
    titulo: "7 chats + agente de código + imagens + embed/rerank ao mesmo tempo",
    script: "stress.py",
    args: ["all", "code+img+rag"],
    precisa: ["glis-chat", "glis-code", "glis-embed", "glis-rerank"],
    timeoutS: 1800,
  },
  soak: {
    titulo: "Soak de 10 min: rajadas de 7 e 10 chats, agente, imagens e RAG",
    script: "soak.py",
    args: ["600"],
    precisa: ["glis-chat", "glis-code", "glis-embed", "glis-rerank"],
    timeoutS: 1500,
  },
} satisfies Record<string, Cenario>;

export type CenarioId = keyof typeof CENARIOS;

export function comandoSubir(s: Servico): string {
  return `cd ${PASTA_REMOTA} && ./subir.sh ${[s.container, s.script, ...s.args].map(shellArg).join(" ")}`;
}

/** Argumentos dos cenários (constantes daqui): aceita "--flag" e "a+b", que o shellArg recusa. */
const ARG_CENARIO = /^-{0,2}[A-Za-z0-9][A-Za-z0-9_.+-]{0,40}$/;

export function comandoCenario(id: CenarioId): string {
  const c: Cenario = CENARIOS[id];
  if (!/^[a-z_]+\.py$/.test(c.script)) throw new Error(`script inválido: ${c.script}`);
  const args = [c.script, ...c.args].map((a) => {
    if (!ARG_CENARIO.test(a)) throw new Error(`argumento recusado: ${JSON.stringify(a)}`);
    return `'${a}'`;
  });
  return `cd ${PASTA_REMOTA} && ./medir.sh python3 ${args.join(" ")}`;
}

export function cenariosAplicaveis(comb: Combinacao, pedidos: string[]): CenarioId[] {
  const tem = new Set(comb.servicos.map((s) => s.container));
  return pedidos.filter((id): id is CenarioId => id in CENARIOS && CENARIOS[id as CenarioId].precisa.every((c) => tem.has(c)));
}

export interface Saida {
  linhas: Record<string, unknown>[];
  memMinMb: number | null;
  acertos: { ok: number; total: number } | null;
  texto: string;
}

/** Separa o que os scripts imprimem: linhas JSON (resultados), a memória do medir.sh e o texto livre (o qual_rag.py). */
export function lerSaida(stdout: string): Saida {
  const linhas: Record<string, unknown>[] = [];
  const texto: string[] = [];
  let memMinMb: number | null = null;
  let acertos: Saida["acertos"] = null;
  for (const linha of stdout.split("\n")) {
    const t = linha.trim();
    if (!t) continue;
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        const obj = JSON.parse(t) as unknown;
        if (Array.isArray(obj)) continue;
        if (obj && typeof obj === "object") {
          const o = obj as Record<string, unknown>;
          if (typeof o.mem_min_disponivel_mb === "number" && Object.keys(o).length === 1) memMinMb = o.mem_min_disponivel_mb;
          else linhas.push(o);
          continue;
        }
      } catch {
        // não é JSON (um "[OK] ..." do qual_rag.py, por exemplo): vai para o texto
      }
    }
    const total = /^TOTAL .*: (\d+)\/(\d+)$/.exec(t);
    if (total) acertos = { ok: Number(total[1]), total: Number(total[2]) };
    texto.push(linha);
  }
  return { linhas, memMinMb, acertos, texto: texto.join("\n") };
}

// Critério do chat (PRD RNF-01 e o princípio do Junior): com 7 pessoas, primeiro token em até 5 s e ≥ 35 tok/s por usuário.
// Vale a carga realista (carga_real.py); a rajada, com os 7 no mesmo segundo, é só o pior caso.
export const META_TTFT_S = 5;
export const META_TOK_S = 35;
export const META_CONC = 7;

const dec = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export interface ResumoCarga {
  ttftP95: number;
  tokSPorUsuario: number;
  erros: number;
  passa: boolean;
  motivos: string[];
}

export function resumoCarga(linhas: Record<string, unknown>[]): ResumoCarga | null {
  const l = linhas.find((x) => x.conc === META_CONC);
  if (!l) return null;
  const ttftP95 = Number(l.ttft_p95);
  const tokSPorUsuario = Number(l.dec_tps_por_req);
  const erros = Number(l.erros ?? 0);
  const motivos: string[] = [];
  if (!(ttftP95 <= META_TTFT_S)) motivos.push(`primeiro token em ${dec(ttftP95)} s (meta ≤ ${META_TTFT_S} s)`);
  if (!(tokSPorUsuario >= META_TOK_S)) motivos.push(`${dec(tokSPorUsuario)} tok/s por usuário (meta ≥ ${META_TOK_S})`);
  if (erros > 0) motivos.push(`${erros} ${erros === 1 ? "erro" : "erros"}`);
  return { ttftP95, tokSPorUsuario, erros, passa: motivos.length === 0, motivos };
}
