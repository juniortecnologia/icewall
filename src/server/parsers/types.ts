export interface GpuReading {
  temp: number | null;
  util: number | null;
  power: number | null;
  clock: number | null;
}

export interface ComputeApp {
  pid: number;
  name: string;
  usedMiB: number | null;
}

/** Valores em bytes. */
export interface MemInfo {
  memTotal: number;
  memAvailable: number;
  swapTotal: number;
  swapFree: number;
}

export interface LoadAvg {
  load1: number;
  load5: number;
  load15: number;
}

/** Valores em bytes. */
export interface DiskUsage {
  total: number;
  used: number;
}

export interface AptPackage {
  name: string;
  suites: string[];
  version: string;
  arch: string;
  from: string | null;
  security: boolean;
}

export type ListenScope = "loopback" | "any" | "specific";

export interface ListenPort {
  port: number;
  addresses: string[];
  scope: ListenScope;
}

export interface FailedUnit {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface SshAuthFailures {
  count: number;
  byIp: { ip: string; count: number }[];
  users: string[];
}
