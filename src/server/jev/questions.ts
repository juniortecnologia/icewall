import { choice, noul, score } from "@typesafe-ai/sdk";

/**
 * Perguntas da Jev. Cada uma é um julgamento estreito; o código combina as respostas.
 * Os IDs não vão para o modelo, então cada pergunta carrega o sentido completo.
 */

export const FAILURE_CAUSES = {
  none: "The generated code was accepted as-is: tests passed and the reviewer did not need to change it.",
  ambiguous_spec:
    "The task description left the expected behavior open, so the model implemented a reasonable but different interpretation.",
  missing_context:
    "The model lacked a file, type, convention or API it needed and could not have inferred from what it was given.",
  logic_error:
    "The spec was clear and the context sufficient, but the model got the logic wrong (edge case, off-by-one, wrong rule).",
  format_or_extraction:
    "The model did not return code in the requested format, the output was truncated, or it tried to rewrite read-only files.",
  invented_api: "The code relied on functions, imports or APIs that do not exist.",
  code_quality:
    "The code was functionally correct but the reviewer had to clean it up: dead code, duplication, needless comments, project style.",
  test_environment:
    "The failure came from the test command or environment (missing dependency, wrong path, tooling), not from the generated code.",
  too_complex: "The task needed design decisions or more reasoning than a small local model handles reliably.",
  infrastructure:
    "No code was produced because the local model server was unavailable, timed out, or the request was refused (context too large, secret detected).",
} as const;

export const TASK_KINDS = {
  tests: "Writing or extending automated tests.",
  types: "Type definitions, interfaces, schemas.",
  boilerplate: "Scaffolding, config files, repetitive glue code.",
  conversion: "Converting code or data between formats, languages or styles.",
  parsing: "Parsing text or command output into structured data.",
  utility: "Small self-contained helper functions with clear inputs and outputs.",
  ui_component: "Frontend components or markup.",
  refactor: "Renaming or restructuring existing code without changing behavior.",
  docs: "Documentation or comments.",
  other: "Anything that does not fit the other kinds.",
} as const;

export const delegationQuestions = {
  failure_cause: choice(
    "Look at `outcome` and `review`. What was the main reason the delegated code was not accepted exactly as produced? If it was accepted as-is, choose none.",
    FAILURE_CAUSES,
  ),
  task_kind: choice("What kind of coding work does `task_excerpt` ask for?", TASK_KINDS),
  best_route: choice(
    "Given the task in `task_excerpt` and how this run went, which route would have produced acceptable code at the lowest total cost?",
    {
      local_fast:
        "The default local model is enough: the task is mechanical and fully specified, a first-try success is likely.",
      local_quality:
        "A different, more careful local model should get it: the task is well specified but has subtle logic the default model tends to miss.",
      claude_direct:
        "Claude should write it directly: writing the spec costs about as much as the code, or the task needs judgment, design or project knowledge.",
    },
  ),
  worth_delegating: noul(
    "Was delegating this task worthwhile compared with Claude writing the code itself? Weigh `spec_tokens_est` against `outcome.eval_tokens`, the number of rounds, and whether the reviewer had to fix or discard the result.",
    {
      true: "Delegation saved Claude work: the produced code was substantially longer than the spec and needed little or no fixing.",
      false:
        "Delegation did not pay off: the spec was about as long as the code, or the result needed heavy fixing, or it was discarded.",
    },
  ),
  bottleneck: choice("Looking at `timing`, what dominated the wall-clock time of this delegation run?", {
    generation: "Token generation itself, at the usual speed for this model.",
    model_load:
      "Loading the model into memory: wall time far exceeds generation time while rounds are few and the prompt is not large.",
    test_loop: "Several test-and-fix rounds.",
    large_context: "Processing a very large prompt (tens of thousands of tokens).",
    slow_generation: "Generation itself ran clearly slower than this model's usual tokens per second.",
    none: "The run was short; nothing stands out.",
  }),
} as const;

export const benchFailureQuestions = { failure_cause: delegationQuestions.failure_cause } as const;

export const packageQuestions = {
  severity: score("How serious is it to leave this pending package update uninstalled on this machine?", [
    "Cosmetic, documentation or desktop-only component with no security relevance for a headless AI server.",
    "Bug-fix update for an installed component, with no security impact mentioned.",
    "Security fix for a component that is installed but not network-facing and not used by the AI workloads.",
    "Security fix for a network-facing service, the kernel, the container runtime, or a library such services load.",
  ]),
  touches_gpu_stack: noul(
    "Could installing this update affect the GPU and AI stack of the machine (NVIDIA driver or firmware, CUDA, kernel or kernel modules, Docker, containerd, the NVIDIA container toolkit)?",
  ),
  needs_restart: noul(
    "Will applying this update require a reboot or a restart of Docker or the running containers, interrupting the AI services?",
  ),
} as const;

export const portQuestions = {
  risky_exposure: noul(
    "Is it risky that this service listens on all network interfaces, given the machine is a single-user AI workstation on a shared office LAN?",
    {
      true: "Other devices on the LAN could use or control the service without authentication (model API, notebook, web UI, admin port).",
      false: "The exposure is expected and protected (for example SSH with key authentication) or the service is harmless.",
    },
  ),
} as const;

export const HOST_CONTEXT =
  "NVIDIA DGX Spark (GB10 Grace Blackwell, Ubuntu 24.04 arm64, 128 GB unified memory). Headless single-user AI server on an office LAN, accessed by SSH. Runs Ollama and vLLM in Docker containers, plus ComfyUI. Ollama's HTTP API has no authentication.";
