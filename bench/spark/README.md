# Bancada do Spark (vinda da glis-bench)

Estes scripts vieram de `~/glis-bench` no Spark (9/10/2026), onde foi medida a primeira combinação do vLLM para a Plataforma IA eFacini. Eles rodam **dentro do Spark** e chamam `127.0.0.1`, para a rede não entrar no TTFT. O ICEWALL os copia para o Spark, roda por ssh e guarda o resultado.

| Script | O que mede |
|---|---|
| `bench_oai.py` | Carga num vLLM (API OpenAI): N chats simultâneos com prompts RAG distintos; TTFT mediano, p95 e máximo, tok/s por pedido e agregado. Com `--bg-*`, mede um segundo modelo gerando ao fundo. |
| `qual_rag.py` | Qualidade de RAG em PT-BR: 10 perguntas sobre os requisitos não funcionais do PRD, 2 delas sem resposta no texto (armadilhas). |
| `ctx_test.py` | Contexto longo (~17k, ~34k, ~57k tokens), frio e com o cache de prefixo quente. |
| `stress.py` | Imagem no ComfyUI (FLUX.2 klein 4B, 4 passos) sozinha ou com chat, código e RAG juntos. |
| `soak.py` | A configuração inteira por N segundos: rajadas de 7 ou 10 chats, agente de código, imagens e embed/rerank. |
| `emb_qual.py` | Qualidade de busca do embedding em PT-BR (XPQA produtos e Quati), nDCG@10 e acerto@10 com e sem o reranker; usa o venv da glis-bench (numpy, pyarrow) e os dados em `~/glis-bench/dados`. |
| `img_voto.py` | Os mesmos 8 prompts de produto em FLUX.2 klein, Qwen-Image-2512 e Z-Image-Turbo, mesma semente, para o voto às cegas. `stress.py` e `carga_real.py --img-model` escolhem o modelo de imagem. |
| `gate.py` / `gate_test.py` | Pausa o agente de código (vLLM `/pause`) enquanto há chat ou imagem ativos; A/B do efeito. |
| `serve-*.sh`, `subir-tudo.sh` | Sobem os containers `glis-*` (chat :8000, código :8001, embed :8002, rerank :8003) com a imagem `nvcr.io/nvidia/vllm:26.09-py3`. |

Os prompts usam o `PRD.md` da plataforma, que fica só no Spark (`~/glis-bench/PRD.md`), fora do git, por ser documento interno.
