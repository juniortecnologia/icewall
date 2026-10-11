#!/usr/bin/env python3
# Qualidade de RAG em pt-BR: pergunta com resposta verificável no trecho do PRD (RNFs) + 2 armadilhas. Uso: qual_rag.py PORT MODEL [think 0|1]
import json, sys, os, urllib.request, re
port, model = int(sys.argv[1]), sys.argv[2]; think = len(sys.argv) > 3 and sys.argv[3] == "1"
L = open(os.path.expanduser("~/glis-bench/PRD.md"), encoding="utf-8").read().splitlines()
i0 = next(i for i, l in enumerate(L) if l.startswith("## 7. Requisitos não funcionais"))
i1 = next(i for i, l in enumerate(L) if l.startswith("### 8.2 Ambientes"))
CTX = "\n".join(L[i0:i1])
# (pergunta, [grupos de alternativas: cada grupo precisa ter ao menos 1 termo na resposta], tipo)
Q = [
 ("Qual algoritmo de hash de senha o PRD exige?", [["argon2id"]], "fato"),
 ("Em quanto tempo deve sair a arte por texto (1 variação 1:1) com a fila vazia?", [["30 s", "30s", "30 segundos"]], "fato"),
 ("Quais portas do Spark só podem aceitar conexões da VM da plataforma e do servidor N8N?", [["11434"], ["8188"]], "fato"),
 ("Quantos usuários simultâneos no chat o primeiro token deve sair em até 5 s?", [["7", "sete"], ["5 s", "5s", "5 segundos"]], "fato"),
 ("O que os logs estruturados NÃO podem conter?", [["mensagens", "conteúdo"], ["dados de clientes", "cliente"]], "fato"),
 ("Qual contraste mínimo vale para texto?", [["4,5", "4.5"]], "fato"),
 ("Se o Ollama e o ComfyUI estiverem fora, o que continua funcionando?", [["login"], ["histórico", "historico"], ["galeria"]], "multi"),
 ("Qual é o valor mensal do contrato da Facini com a NVIDIA pelo Spark?", [["não", "nao"]], "armadilha-sem-resposta"),
 ("De acordo com o PRD, o Redis deve usar qual versão e por quê?", [["não", "nao"]], "armadilha-sem-resposta"),
 ("Quantos usuários podem estar cadastrados e quantos simultâneos no chat sem erro (RNF-03)?", [["50"], ["7", "sete"]], "fato"),
]
ok = 0; rows = []
for q, groups, kind in Q:
    body = {"model": model, "max_tokens": 700, "temperature": 0.2, "chat_template_kwargs": {"enable_thinking": think},
            "messages": [{"role": "system", "content": "Responda em português do Brasil usando SOMENTE o contexto fornecido. Se a informação não estiver no contexto, diga claramente que não consta."},
                         {"role": "user", "content": f"Contexto:\n{CTX}\n\nPergunta: {q}"}]}
    r = json.loads(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=300).read())
    a = (r["choices"][0]["message"].get("content") or "").strip(); al = a.lower()
    hit = all(any(t.lower() in al for t in g) for g in groups)
    ok += hit; rows.append((kind, hit, q, a.replace("\n", " ")[:260], r["usage"]["completion_tokens"]))
for k, h, q, a, n in rows: print(f"[{'OK' if h else 'FALHA'}] ({k}, {n} tok) {q}\n      → {a}")
print(f"\nTOTAL {model} think={think}: {ok}/{len(Q)}")
