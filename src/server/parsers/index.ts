import type { AptPackage, ComputeApp, DiskUsage, FailedUnit, GpuReading, ListenPort, LoadAvg, MemInfo, SshAuthFailures } from "./types";

export function parseSections(out: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = out.split("\n");
  let currentKey: string | null = null;
  for (const line of lines) {
    const match = line.match(/^@@(.+)@@$/);
    if (match) {
      currentKey = match[1];
      result[currentKey] = "";
    } else if (currentKey !== null) {
      result[currentKey] += line + "\n";
    }
  }
  for (const key of Object.keys(result)) {
    result[key] = result[key].trim();
  }
  return result;
}

export function parseNvidiaGpu(csv: string): GpuReading | null {
  const lines = csv.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const fields = lines[0].split(",").map((f) => f.trim());
  if (fields.length < 4) return null;

  const parseVal = (s: string): number | null => {
    if (s === "N/A" || s === "[N/A]") return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  return {
    temp: parseVal(fields[0]),
    util: parseVal(fields[1]),
    power: parseVal(fields[2]),
    clock: parseVal(fields[3]),
  };
}

export function parseComputeApps(csv: string): ComputeApp[] {
  const lines = csv.split("\n");
  const result: ComputeApp[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split(",");
    if (parts.length < 3) continue;
    const pidStr = parts[0].trim();
    if (!/^\d+$/.test(pidStr)) continue;
    const pid = Number(pidStr);
    const name = parts[1].trim();
    const memStr = parts[2].trim();
    let usedMiB: number | null = null;
    if (memStr !== "N/A" && memStr !== "[N/A]") {
      const n = Number(memStr);
      if (!isNaN(n)) usedMiB = n;
    }
    result.push({ pid, name, usedMiB });
  }
  return result;
}

export function parseMeminfo(text: string): MemInfo {
  const lines = text.split("\n");
  let memTotal = 0;
  let memAvailable = 0;
  let swapTotal = 0;
  let swapFree = 0;

  for (const line of lines) {
    const match = line.match(/^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+)\s+kB$/);
    if (match) {
      const key = match[1];
      const val = Number(match[2]) * 1024;
      if (key === "MemTotal") memTotal = val;
      else if (key === "MemAvailable") memAvailable = val;
      else if (key === "SwapTotal") swapTotal = val;
      else if (key === "SwapFree") swapFree = val;
    }
  }

  return { memTotal, memAvailable, swapTotal, swapFree };
}

export function parseLoadavg(text: string): LoadAvg {
  const parts = text.trim().split(/\s+/);
  return {
    load1: Number(parts[0]),
    load5: Number(parts[1]),
    load15: Number(parts[2]),
  };
}

export function parseDf(text: string): DiskUsage | null {
  const lines = text.split("\n");
  if (lines.length < 2) return null;
  const dataLine = lines[1].trim();
  if (dataLine === "") return null;
  const parts = dataLine.split(/\s+/);
  if (parts.length < 2) return null;
  const total = Number(parts[0]);
  const used = Number(parts[1]);
  if (isNaN(total) || isNaN(used)) return null;
  return { total, used };
}

export function parseDockerJsonLines(text: string): Record<string, unknown>[] {
  const lines = text.split("\n");
  const result: Record<string, unknown>[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
        result.push(obj);
      }
    } catch {
      }
  }
  return result;
}

export function parseSize(s: string): number | null {
  if (!s) return null;
  const match = s.match(/^([0-9]*\.?[0-9]+)\s*(.*)$/);
  if (!match) return null;
  const val = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (isNaN(val)) return null;

  if (unit === "B" || unit === "") {
    return val;
  } else if (unit.endsWith("IB")) {
    const base = unit.slice(0, -2);
    let multiplier = 1;
    if (base === "K") multiplier = 1024;
    else if (base === "M") multiplier = 1024 ** 2;
    else if (base === "G") multiplier = 1024 ** 3;
    else if (base === "T") multiplier = 1024 ** 4;
    else return null;
    return val * multiplier;
  } else {
    const base = unit.slice(0, -1);
    let multiplier = 1;
    if (base === "K") multiplier = 1000;
    else if (base === "M") multiplier = 1000 ** 2;
    else if (base === "G") multiplier = 1000 ** 3;
    else if (base === "T") multiplier = 1000 ** 4;
    else return null;
    return val * multiplier;
  }
}

export function parseDockerMem(s: string): { used: number; limit: number } | null {
  const parts = s.split("/");
  if (parts.length !== 2) return null;
  const used = parseSize(parts[0].trim());
  const limit = parseSize(parts[1].trim());
  if (used === null || limit === null) return null;
  return { used, limit };
}

export function parsePercent(s: string): number | null {
  const match = s.match(/^([0-9]*\.?[0-9]+)%$/);
  if (!match) return null;
  const val = Number(match[1]);
  return isNaN(val) ? null : val;
}

export function parseAptUpgradable(text: string): AptPackage[] {
  const lines = text.split("\n");
  const result: AptPackage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "Listing...") continue;

    const match = trimmed.match(/^([^\/]+)\/([^\s]+)\s+(\S+)\s+(\S+)(?:\s+\[upgradable from:\s+(\S+)\])?$/);
    if (!match) continue;

    const name = match[1];
    const suitesStr = match[2];
    const version = match[3];
    const arch = match[4];
    const from = match[5] || null;
    const suites = suitesStr.split(",");
    const security = suites.some((s) => s.endsWith("-security"));

    result.push({ name, suites, version, arch, from, security });
  }
  return result;
}

export function parseSsListen(text: string): ListenPort[] {
  const lines = text.split("\n");
  const portMap = new Map<number, Set<string>>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("LISTEN")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;

    const localAddr = parts[3];
    const lastColonIdx = localAddr.lastIndexOf(":");
    if (lastColonIdx === -1) continue;

    const addrPart = localAddr.slice(0, lastColonIdx);
    const portStr = localAddr.slice(lastColonIdx + 1);
    const port = Number(portStr);
    if (isNaN(port)) continue;

    let cleanAddr = addrPart;
    if (cleanAddr.startsWith("[") && cleanAddr.endsWith("]")) {
      cleanAddr = cleanAddr.slice(1, -1);
    }

    if (!portMap.has(port)) {
      portMap.set(port, new Set());
    }
    portMap.get(port)!.add(cleanAddr);
  }

  const result: ListenPort[] = [];
  for (const [port, addrSet] of portMap) {
    const addresses = Array.from(addrSet);
    let scope: ListenPort["scope"] = "specific";

    const hasAny = addresses.some((a) => a === "0.0.0.0" || a === "::" || a === "*");
    if (hasAny) {
      scope = "any";
    } else {
      const isLoopback = (a: string) => {
        const clean = a.split("%")[0];
        return clean.startsWith("127.") || clean === "::1";
      };
      if (addresses.every(isLoopback)) {
        scope = "loopback";
      } else {
        scope = "specific";
      }
    }

    result.push({ port, addresses, scope });
  }

  result.sort((a, b) => a.port - b.port);
  return result;
}

export function parseKeyValue(text: string): Record<string, string> {
  const lines = text.split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let value = trimmed.slice(eqIdx + 1);

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function parseCudaVersion(nvidiaSmiText: string): string | null {
  const match = nvidiaSmiText.match(/CUDA Version:\s+(\d+\.\d+)/);
  if (!match) return null;
  return match[1];
}

export function parseSystemctlFailed(text: string): FailedUnit[] {
  const lines = text.split("\n");
  const result: FailedUnit[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;

    const unit = parts[0];
    const load = parts[1];
    const active = parts[2];
    const sub = parts[3];
    const description = parts.slice(4).join(" ");

    result.push({ unit, load, active, sub, description });
  }
  return result;
}

const AUTH_FAILURE_PATTERNS = [
  /Failed password for invalid user (\S+) from (\S+)/,
  /Invalid user (\S+) from (\S+)/,
  /Failed password for (\S+) from (\S+)/,
];

export function parseSshAuthFailures(text: string): SshAuthFailures {
  let count = 0;
  const ipCounts = new Map<string, number>();
  const users = new Set<string>();
  for (const line of text.split("\n")) {
    const match = AUTH_FAILURE_PATTERNS.map((re) => line.match(re)).find((m) => m !== null);
    if (!match) continue;
    count++;
    users.add(match[1]);
    ipCounts.set(match[2], (ipCounts.get(match[2]) ?? 0) + 1);
  }
  // Map preserva a ordem de inserção e o sort é estável: empate fica na ordem da primeira aparição.
  const byIp = [...ipCounts].map(([ip, n]) => ({ ip, count: n })).sort((a, b) => b.count - a.count);
  return { count, byIp, users: [...users] };
}

/** Métodos que o sshd ainda oferece, lidos de "Permission denied (publickey,password)." no stderr do ssh. */
export function parseSshAuthMethods(stderr: string): string[] | null {
  const m = stderr.match(/Permission denied \(([^)]*)\)/);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
}
