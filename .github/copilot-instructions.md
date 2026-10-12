# Instruções de Delegação para Modelos Locais (Nvidia Spark)

O ambiente conta com servidores locais de inferência no Nvidia Spark (`10.0.5.18`):
1. **vLLM (Glis)**: `http://10.0.5.18:8000/v1` - Modelo `chat` (Qwen3.6-35B-A3B NVFP4, ~125 tok/s, ultra-rápido).
2. **Ollama**: `http://10.0.5.18:11434` - Modelos `gemma4:26b` (qualidade/lógica), `qwen3.6:35b-a3b` (visão) e `qwen3.8-code:27b-128k` (reserva).

### Como usar pelo Copilot:
- O servidor MCP `spark-models` disponibiliza as ferramentas:
  - `spark_list_models`: Consulta o status e modelos ativos em ambos os backends.
  - `spark_generate`: Envia pedidos com tiers:
    - `tier: "fast"` (vLLM Qwen3.6-35B-A3B NVFP4, padrão para tarefas mecânicas, boilerplate, conversões, testes unitários).
    - `tier: "quality"` (Ollama Gemma4:26b para lógica refinada ou segunda opinião).
    - `tier: "custom"` com `model_name` para escolher explicitamente outro modelo (ex: `qwen3.8-code:27b-128k`).
  - `spark_vision`: Análise multimodal de imagens e mockups via Qwen3.6 35B Vision.
