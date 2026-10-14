import "server-only";
import type {
  DockerSnapshot,
  OsSnapshot,
  PortInfo,
  SecuritySnapshot,
  UpdatesSnapshot,
} from "@/lib/types";
import { addEvent, getServerSnapshot, putSnapshot, serverSnapshotKey } from "../../lib/store";
import {
  parseAptUpgradable,
  parseCudaVersion,
  parseKeyValue,
  parseSections,
  parseSshAuthFailures,
  parseSsListen,
  parseSystemctlFailed,
} from "../../parsers";
import { containerPorts, KNOWN_PORTS, securityFindings } from "../findings";
import { execOnServer, type ServerRef } from "../../executor";
import { sshAuthMethods } from "../ssh";

const OS_CMD = [
  "echo @@osrel@@; cat /etc/os-release",
  "echo @@kernel@@; uname -r",
  "echo @@boot@@; uptime -s",
  "echo @@smi@@; nvidia-smi | head -5",
  "echo @@gpu@@; nvidia-smi --query-gpu=name,driver_version --format=csv,noheader",
  "echo @@docker@@; docker version --format '{{.Server.Version}}'",
  "echo @@pkgs@@; dpkg-query -W -f='${Package}=${Version}\\n' containerd.io docker-ce nvidia-container-toolkit openssh-server linux-firmware 2>/dev/null",
  "echo @@python@@; python3 --version",
  "echo @@cuda@@; ls -d /usr/local/cuda-* 2>/dev/null",
  "echo @@vllm@@; docker images --format '{{.Repository}}:{{.Tag}}' | grep -i vllm | head -5 | while read i; do echo \"$i $(docker image inspect --format '{{index .Config.Labels \"com.nvidia.vllm.version\"}}' \"$i\")\"; done",
].join("; ");

/** Coleta o SO de UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectOs(server: ServerRef): Promise<void> {
  const key = serverSnapshotKey(server.id, "os");
  const res = await execOnServer(server.id, OS_CMD, 30_000);
  if (!res.stdout.includes("@@osrel@@")) {
    putSnapshot(key, null, res.stderr.trim() || `saída ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const [gpuName, driver] = (s.gpu ?? "").split(",").map((x) => x.trim());
  const snap: OsSnapshot = {
    prettyName: parseKeyValue(s.osrel ?? "").PRETTY_NAME ?? null,
    kernel: s.kernel || null,
    bootedAt: s.boot || null,
    gpuName: gpuName || null,
    driver: driver || null,
    cuda: parseCudaVersion(s.smi ?? ""),
    cudaToolkits: (s.cuda ?? "").split("\n").filter(Boolean).map((p) => p.replace("/usr/local/", "")),
    docker: s.docker || null,
    python: (s.python ?? "").replace("Python ", "") || null,
    packages: Object.fromEntries(
      (s.pkgs ?? "")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    ),
    vllm: (s.vllm ?? "")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [image, version = ""] = l.split(" ");
        return { image, version };
      }),
  };
  const prev = getServerSnapshot<OsSnapshot>(server.id, "os")?.data;
  if (prev) {
    for (const [label, a, b] of [
      ["Kernel", prev.kernel, snap.kernel],
      ["Driver NVIDIA", prev.driver, snap.driver],
      ["CUDA", prev.cuda, snap.cuda],
      ["Docker", prev.docker, snap.docker],
    ] as const) {
      if (a && b && a !== b) addEvent("runtime", "info", `${label}: ${a} → ${b}`, undefined, server.id);
    }
  }
  putSnapshot(key, snap);
}

const UPDATES_CMD = [
  "echo @@apt@@; apt list --upgradable 2>/dev/null",
  "echo @@reboot@@; test -f /var/run/reboot-required && echo REBOOT; cat /var/run/reboot-required.pkgs 2>/dev/null; true",
  "echo @@stamp@@; stat -c %Y /var/lib/apt/periodic/update-success-stamp 2>/dev/null || stat -c %Y /var/lib/apt/lists",
].join("; ");

/** Coleta updates (apt) de UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectUpdates(server: ServerRef): Promise<void> {
  const key = serverSnapshotKey(server.id, "updates");
  const res = await execOnServer(server.id, UPDATES_CMD, 60_000);
  if (!res.stdout.includes("@@apt@@")) {
    putSnapshot(key, null, res.stderr.trim() || `saída ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const rebootLines = (s.reboot ?? "").split("\n").filter(Boolean);
  const snap: UpdatesSnapshot = {
    packages: parseAptUpgradable(s.apt ?? ""),
    rebootRequired: rebootLines[0] === "REBOOT",
    rebootPackages: rebootLines.filter((l) => l !== "REBOOT"),
    listsUpdatedAt: Number(s.stamp) ? Number(s.stamp) * 1000 : null,
  };
  const prev = getServerSnapshot<UpdatesSnapshot>(server.id, "updates")?.data;
  if (prev) {
    const known = new Set(prev.packages.map((p) => `${p.name}=${p.version}`));
    const fresh = snap.packages.filter((p) => p.security && !known.has(`${p.name}=${p.version}`));
    if (fresh.length) {
      addEvent("updates", "warn", `${fresh.length} update(s) de segurança novos`, { packages: fresh.map((p) => p.name) }, server.id);
    }
    if (snap.rebootRequired && !prev.rebootRequired) addEvent("updates", "warn", `Reboot pendente em ${server.nome}`, undefined, server.id);
  }
  putSnapshot(key, snap);
}

const SECURITY_CMD = [
  "echo @@ss@@; ss -tlnH",
  "echo @@failed@@; systemctl --failed --plain --no-legend",
  "echo @@auth@@; journalctl -u ssh --since '-24h' --no-pager 2>/dev/null | grep -E 'Failed password|Invalid user' | tail -1000",
  "echo @@uu@@; systemctl is-active unattended-upgrades; systemctl is-enabled unattended-upgrades 2>&1 | head -1",
  "echo @@ufw@@; systemctl is-active ufw",
  "echo @@client@@; echo ${SSH_CLIENT%% *}",
  "echo @@sshd@@; grep -hiE '^[[:space:]]*(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|KbdInteractiveAuthentication)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null",
].join("; ");

/** Coleta a superfície de segurança de UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectSecurity(server: ServerRef): Promise<void> {
  const key = serverSnapshotKey(server.id, "security");
  const [res, methods] = await Promise.all([execOnServer(server.id, SECURITY_CMD, 30_000), sshAuthMethods(server.host)]);
  if (!res.stdout.includes("@@ss@@")) {
    putSnapshot(key, null, res.stderr.trim() || `saída ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const byContainer = containerPorts(getServerSnapshot<DockerSnapshot>(server.id, "docker")?.data);
  const ports: PortInfo[] = parseSsListen(s.ss ?? "").map((p) => ({
    ...p,
    service: byContainer.get(p.port) ?? KNOWN_PORTS[p.port] ?? null,
  }));
  const [unattendedActive = "", unattendedEnabled = ""] = (s.uu ?? "").split("\n");
  const sshdConfig = Object.fromEntries(
    (s.sshd ?? "")
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .map(([k, v]) => [k, v]),
  );
  const base = {
    ports,
    failedUnits: parseSystemctlFailed(s.failed ?? ""),
    auth: parseSshAuthFailures(s.auth ?? ""),
    unattendedActive,
    unattendedEnabled,
    ufwActive: s.ufw ?? "",
    sshdConfig,
    passwordAuth: methods ? methods.some((m) => m === "password" || m === "keyboard-interactive") : null,
    clientIp: s.client?.trim() || null,
  };
  const findings = securityFindings(base);
  const prev = getServerSnapshot<SecuritySnapshot>(server.id, "security")?.data;
  if (prev) {
    const known = new Set(prev.findings.map((f) => f.key));
    for (const f of findings) if (!known.has(f.key)) addEvent("security", f.severity, f.title, { detail: f.detail }, server.id);
    const before = new Set(prev.ports.map((p) => p.port));
    for (const p of ports) if (!before.has(p.port)) addEvent("security", "warn", `Nova porta escutando: ${p.port} (${p.scope})`, undefined, server.id);
  }
  putSnapshot(key, { ...base, findings } satisfies SecuritySnapshot);
}
