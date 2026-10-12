#!/usr/bin/env python3
# Qualidade de busca do embedding em PT-BR, com e sem o reranker (glis-embed :8002, glis-rerank :8003).
# Conjuntos (em ~/glis-bench/dados, baixados do Hugging Face):
#   quati: MTEB-BR/quati-50k, 50 perguntas da web brasileira com relevância graduada (0–3); corpus = trechos julgados + 8.000 sorteados.
#   xpqa:  mteb/XPQARetrieval por-por, 800 perguntas sobre produtos (o caso de e-commerce), corpus inteiro (1.622 respostas).
# Mede nDCG@10 e acerto@10 (alguma resposta relevante entre as 10 primeiras), só com o embedding e com o reranker
# reordenando as 30 primeiras; e a velocidade do embedding (trechos por segundo).
# Uso: emb_qual.py [qwen|bge]  (qwen: as perguntas levam a instrução do Qwen3-Embedding; bge: sem instrução)
import json, os, random, sys, time, urllib.request

# numpy e pyarrow estão no venv da glis-bench, não no python3 do sistema.
VENV = os.path.expanduser("~/glis-bench/venv/bin/python")
try:
    import numpy as np
    import pyarrow.parquet as pq
except ImportError:
    os.execv(VENV, [VENV] + sys.argv)

DADOS = os.path.expanduser("~/glis-bench/dados")
ESTILO = sys.argv[1] if len(sys.argv) > 1 else "qwen"
INSTRUCAO = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:"
MAX_TOKENS = 512  # trunca os trechos: mesma régua para todos os modelos
TOPK_RERANK = 30


def post(port, path, body, timeout=300):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def embed(textos, lote=32):
    out = []
    for i in range(0, len(textos), lote):
        r = post(8002, "/v1/embeddings", {"model": "embed", "input": textos[i:i + lote], "truncate_prompt_tokens": MAX_TOKENS})
        out.extend(d["embedding"] for d in sorted(r["data"], key=lambda d: d["index"]))
    m = np.asarray(out, dtype=np.float32)
    return m / np.linalg.norm(m, axis=1, keepdims=True)


def rerank(pergunta, docs):
    r = post(8003, "/rerank", {"model": "rerank", "query": pergunta, "documents": docs, "truncate_prompt_tokens": MAX_TOKENS})
    return [x["index"] for x in sorted(r["results"], key=lambda x: -x["relevance_score"])]


def tabela(caminho):
    return pq.read_table(caminho).to_pylist()


def carregar(nome):
    if nome == "quati":
        base = f"{DADOS}/quati-50k"
        corpus = {d["_id"]: (d["title"] + " " + d["text"]).strip() for d in tabela(f"{base}/corpus/test-00000-of-00001.parquet")}
        perguntas = {q["_id"]: q["text"] for q in tabela(f"{base}/queries/test-00000-of-00001.parquet")}
        qrels_t = tabela(f"{base}/qrels/test-00000-of-00001.parquet")
        julgados = {r["corpus-id"] for r in qrels_t}
        resto = sorted(set(corpus) - julgados)
        random.Random(42).shuffle(resto)
        corpus = {k: corpus[k] for k in sorted(julgados & set(corpus)) + resto[:8000]}
    else:
        base = f"{DADOS}/xpqa"
        corpus = {d["id"]: (d["title"] + " " + d["text"]).strip() for d in tabela(f"{base}/por-por-corpus/test-00000-of-00001.parquet")}
        perguntas = {q["id"]: q["text"] for q in tabela(f"{base}/por-por-queries/test-00000-of-00001.parquet")}
        qrels_t = tabela(f"{base}/por-por-qrels/test-00000-of-00001.parquet")
    qrels = {}
    for r in qrels_t:
        if int(r["score"]) > 0 and r["corpus-id"] in corpus:
            qrels.setdefault(r["query-id"], {})[r["corpus-id"]] = int(r["score"])
    perguntas = {k: v for k, v in perguntas.items() if k in qrels}
    return corpus, perguntas, qrels


def ndcg10(ranking, rel):
    dcg = sum((2 ** rel.get(d, 0) - 1) / np.log2(i + 2) for i, d in enumerate(ranking[:10]))
    ideal = sorted(rel.values(), reverse=True)[:10]
    idcg = sum((2 ** g - 1) / np.log2(i + 2) for i, g in enumerate(ideal))
    return dcg / idcg if idcg else 0.0


def avaliar(nome):
    corpus, perguntas, qrels = carregar(nome)
    ids = list(corpus)
    t0 = time.time()
    C = embed([corpus[i] for i in ids])
    seg_corpus = time.time() - t0
    qids = list(perguntas)
    Q = embed([(INSTRUCAO if ESTILO == "qwen" else "") + perguntas[q] for q in qids])
    top = np.argsort(-(Q @ C.T), axis=1)[:, :TOPK_RERANK]
    n_e = a_e = n_r = a_r = 0.0
    t1 = time.time()
    for qi, q in enumerate(qids):
        rank_e = [ids[j] for j in top[qi]]
        ordem = rerank(perguntas[q], [corpus[d] for d in rank_e])
        rank_r = [rank_e[j] for j in ordem]
        rel = qrels[q]
        n_e += ndcg10(rank_e, rel); a_e += any(d in rel for d in rank_e[:10])
        n_r += ndcg10(rank_r, rel); a_r += any(d in rel for d in rank_r[:10])
    n = len(qids)
    return dict(conjunto=nome, perguntas=n, corpus=len(ids), estilo=ESTILO,
                ndcg10=round(n_e / n, 3), acerto10=round(a_e / n, 3),
                ndcg10_rerank=round(n_r / n, 3), acerto10_rerank=round(a_r / n, 3),
                trechos_por_s=round(len(ids) / seg_corpus, 1), rerank_s_por_pergunta=round((time.time() - t1) / n, 2))


if __name__ == "__main__":
    for nome in ("xpqa", "quati"):
        print(json.dumps(avaliar(nome), ensure_ascii=False), flush=True)
