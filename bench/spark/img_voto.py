#!/usr/bin/env python3
# Voto às cegas: os mesmos prompts (fotos de produto; os 3 últimos com texto em PT-BR na imagem) nos três modelos, mesma semente.
# Grava no output do ComfyUI como voto-<modelo>-<n>_*.png e imprime uma linha JSON por imagem e um resumo por modelo.
# Uso: img_voto.py
import json, statistics as st, sys
sys.path.insert(0, ".")
import stress as s

PROMPTS = [
    "Foto de produto para e-commerce: tênis de corrida branco com detalhes azuis, fundo branco infinito, luz de estúdio suave, sombra realista",
    "Foto de produto: garrafa térmica de inox preta sobre mesa de madeira clara, manhã, luz natural lateral, profundidade de campo rasa",
    "Foto lifestyle: mulher sorrindo usando fone de ouvido sem fio em um café, tons quentes, fotografia publicitária",
    "Foto de produto: kit de cosméticos (sérum, creme e tônico) em frascos de vidro âmbar sobre pedra branca, flores secas ao redor",
    "Foto de produto: cafeteira elétrica moderna vermelha em uma bancada de cozinha planejada, iluminação de catálogo",
    'Banner de promoção para loja online: uma mochila cinza ao lado do texto grande "50% OFF" e embaixo "Só nesta semana", fundo amarelo, design limpo',
    'Embalagem de café torrado em pé sobre fundo bege, rótulo com o texto "Café Especial da Serra" e "Torra Média 250g", foto de estúdio',
    'Post para Instagram de uma padaria: pães e croissants em uma cesta, com o título "Fornada Fresquinha" e o rodapé "Entrega grátis no bairro"',
]
MODELOS = ["flux", "qwen", "zimage"]

if __name__ == "__main__":
    for m in MODELOS:
        s.IMG = m
        s.liberar()
        aquecimento = s.gen(PROMPTS[0], seed=1, prefixo=f"voto-aquecimento-{m}")  # carrega o modelo; fora da média
        segs = []
        for n, p in enumerate(PROMPTS):
            r = s.gen(p, seed=1000 + n, prefixo=f"voto-{m}-{n}")
            r.update(modelo=m, prompt=n)
            print(json.dumps(r, ensure_ascii=False), flush=True)
            if r.get("seg"): segs.append(r["seg"])
        print(json.dumps(dict(modelo=m, carga_s=aquecimento.get("seg"), img_seg_med=round(st.median(segs), 1) if segs else None,
                              imagens_ok=len(segs), erro=aquecimento.get("erro")), ensure_ascii=False), flush=True)
    s.liberar()
