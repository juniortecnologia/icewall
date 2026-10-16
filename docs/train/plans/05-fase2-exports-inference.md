# Fase 2: Exports, LoRA Merge e Inference Integrada

> **⚠ Superado pelo plano da Fase 2:** [2026-10-15-fase2-treinar-lab-producao.md](2026-10-15-fase2-treinar-lab-producao.md) — quantização/exports são a Etapa T3 (GGUF via Unsloth ou llama.cpp) e a promoção ao serving é a T4. Mantido como contexto histórico.

**Status:** planejamento  
**Depende de:** Fases 0 + 1A + 1B completas  

---

## Objetivos da Fase 2 (iteracao apos MVP)

### Opcoes:
- Export GGUF para qualquer servidor 
- Quantizacao (4bit, 8bit) via `unsloth export --quantize`
- LoRA merge e comparison entre checkpoints  
- Chat/inference integrado pro modelo treinado  
- Playground online pra testar resultados lado a lado  

### Fluxo da interface:
1. Lista de checkpoints disponiveis no Spark (`/api/train/checkpoints`)  
2. Exporta checkpoint → GGUF/LoRA/parquet/quantizado  
3. UI compara checkpoints lado a lado (loss metricas)  
4. Chat integrado para validar o modelo treinado no navegador  

---

## Priorizacao da Fase 2:
1. **Export GGUF** (maior valor imediato — deploy local em outros servidores)  
2. **Inference integrada** (testar modelo via chat no navegador sem precisar SSH)  
3. **LoRA merge & comparison** (avançado — iterar depois)
4. **Playground online** (ultimo — depende das outras estarem funcionando)
