/** Formatos compartilhados entre servidor e interface (só tipos). */
import type { AptPackage, ComputeApp, FailedUnit, GpuReading, ListenPort, SshAuthFailures } from "@/server/parsers/types";

export type { AptPackage, ComputeApp, FailedUnit, GpuReading, ListenPort, SshAuthFailures };

export interface HealthSnapshot {
  gpu: GpuReading | null;
  apps: ComputeApp[];
  memTotal: number;
  memAvailable: number;
  swapTotal: number;
  swapFree: number;
  load1: number;
  load5: number;
  load15: number;
  cpuCount: number;
  diskTotal: number | null;
  diskUsed: number | null;
  ollamaVram: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  contextLength: number | null;
  capabilities: string[];
}

export interface OllamaLoaded {
  name: string;
  size: number;
  sizeVram: number;
  expiresAt: string;
  contextLength: number | null;
}

export interface OllamaSnapshot {
  /** Ollama é capacidade opcional: "offline" é estado legítimo (serviço inativo), nem erro nem lista vazia. */
  status: "online" | "offline";
  url: string;
  version: string | null;
  models: OllamaModel[];
  loaded: OllamaLoaded[];
  /** Presente quando `status` é "offline". */
  reason?: string;
}

export interface VllmModel {
  id: string;
  object: string;
  created: number | null;
  ownedBy: string | null;
  /** Modelo de imagem (Z-Image, Qwen-Image...) — detectado pelo nome. */
  isImage: boolean;
}

export interface VllmSnapshot {
  /**
   * vLLM é capacidade opcional por servidor (Etapa 03):
   * "online": /health + /v1/models + /metrics OK com a chave do registro.
   * "auth": serviço no ar, mas a chave do registro ainda é rejeitada
   * (ex.: borda não aplicada) — estado documentado, nem erro nem lista vazia.
   * "offline": serviço inativo (porta fechada) — estado legítimo.
   */
  status: "online" | "auth" | "offline";
  url: string;
  models: VllmModel[];
  /** Métricas `vllm:*` do Prometheus (nome{labels} → valor). */
  metrics: Record<string, number>;
  /** Presente quando `status` não é "online". */
  reason?: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  runningFor: string;
  gpu: boolean;
}

export interface ContainerStat {
  name: string;
  cpuPct: number | null;
  memUsed: number | null;
  memLimit: number | null;
  netIO: string;
  blockIO: string;
  pids: number | null;
}

export interface DockerImage {
  ref: string;
  size: string;
  createdSince: string;
}

export interface DockerSnapshot {
  containers: ContainerInfo[];
  stats: ContainerStat[];
  images: DockerImage[];
}

export interface OsSnapshot {
  prettyName: string | null;
  kernel: string | null;
  bootedAt: string | null;
  gpuName: string | null;
  driver: string | null;
  cuda: string | null;
  cudaToolkits: string[];
  docker: string | null;
  python: string | null;
  packages: Record<string, string>;
  vllm: { image: string; version: string }[];
}

export interface UpdatesSnapshot {
  packages: AptPackage[];
  rebootRequired: boolean;
  rebootPackages: string[];
  listsUpdatedAt: number | null;
}

export interface PortInfo extends ListenPort {
  service: string | null;
}

export interface SecurityFinding {
  key: string;
  severity: "info" | "warn" | "crit";
  title: string;
  detail: string;
  fix: string | null;
}

export interface SecuritySnapshot {
  ports: PortInfo[];
  failedUnits: FailedUnit[];
  auth: SshAuthFailures;
  unattendedActive: string;
  unattendedEnabled: string;
  ufwActive: string;
  sshdConfig: Record<string, string>;
  /** O sshd ainda oferece senha? Vem de uma tentativa de login sem chave a partir desta máquina; null se a sonda falhou. */
  passwordAuth: boolean | null;
  /** IP desta máquina como o Spark o vê (SSH_CLIENT). */
  clientIp: string | null;
  findings: SecurityFinding[];
}
