import "server-only";
import type {
  DockerSnapshot,
  OsSnapshot,
  PortInfo,
  SecuritySnapshot,
  UpdatesSnapshot,
} from "@/lib/types";
import { addEvent, getSnapshot, putSnapshot } from "../../lib/store";
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
import { execOnServer, serverIdByName } from "../../executor";
import { sparkAuthMethods } from "../ssh";

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

export async function collectOs(): Promise<void> {
  // Migração incremental (Etapa 02): executor por servidor, Spark resolvido
  // por nome no registro (não por constante).
  const sparkId = serverIdByName("Spark");
  if (sparkId === null) {
    putSnapshot("os", null, '[icewall] servidor "Spark" não encontrado no registro — cadastre em /servers');
    return;
  }
  const res = await execOnServer(sparkId, OS_CMD, 30_000);
  if (!res.stdout.includes("@@osrel@@")) {
    putSnapshot("os", null, res.stderr.trim() || `ssh saiu com ${res.code}`);
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
  const prev = getSnapshot<OsSnapshot>("os")?.data;
  if (prev) {
    for (const [label, a, b] of [
      ["Kernel", prev.kernel, snap.kernel],
      ["Driver NVIDIA", prev.driver, snap.driver],
      ["CUDA", prev.cuda, snap.cuda],
      ["Docker", prev.docker, snap.docker],
    ] as const) {
      if (a && b && a !== b) addEvent("runtime", "info", `${label}: ${a} → ${b}`);
    }
  }
  putSnapshot("os", snap);
}

const UPDATES_CMD = [
  "echo @@apt@@; apt list --upgradable 2>/dev/null",
  "echo @@reboot@@; test -f /var/run/reboot-required && echo REBOOT; cat /var/run/reboot-required.pkgs 2>/dev/null; true",
  "echo @@stamp@@; stat -c %Y /var/lib/apt/periodic/update-success-stamp 2>/dev/null || stat -c %Y /var/lib/apt/lists",
].join("; ");

export async function collectUpdates(): Promise<void> {
  const sparkId = serverIdByName("Spark");
  if (sparkId === null) {
    putSnapshot("updates", null, '[icewall] servidor "Spark" não encontrado no registro — cadastre em /servers');
    return;
  }
  const res = await execOnServer(sparkId, UPDATES_CMD, 60_000);
  if (!res.stdout.includes("@@apt@@")) {
    putSnapshot("updates", null, res.stderr.trim() || `ssh saiu com ${res.code}`);
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
  const prev = getSnapshot<UpdatesSnapshot>("updates")?.data;
  if (prev) {
    const known = new Set(prev.packages.map((p) => `${p.name}=${p.version}`));
    const fresh = snap.packages.filter((p) => p.security && !known.has(`${p.name}=${p.version}`));
    if (fresh.length) {
      addEvent("updates", "warn", `${fresh.length} update(s) de segurança novos`, { packages: fresh.map((p) => p.name) });
    }
    if (snap.rebootRequired && !prev.rebootRequired) addEvent("updates", "warn", "Reboot pendente no Spark");
  }
  putSnapshot("updates", snap);
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

export async function collectSecurity(): Promise<void> {
  const sparkId = serverIdByName("Spark");
  if (sparkId === null) {
    putSnapshot("security", null, '[icewall] servidor "Spark" não encontrado no registro — cadastre em /servers');
    return;
  }
  const [res, methods] = await Promise.all([execOnServer(sparkId, SECURITY_CMD, 30_000), sparkAuthMethods()]);
  if (!res.stdout.includes("@@ss@@")) {
    putSnapshot("security", null, res.stderr.trim() || `ssh saiu com ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const byContainer = containerPorts(getSnapshot<DockerSnapshot>("docker")?.data);
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
  const prev = getSnapshot<SecuritySnapshot>("security")?.data;
  if (prev) {
    const known = new Set(prev.findings.map((f) => f.key));
    for (const f of findings) if (!known.has(f.key)) addEvent("security", f.severity, f.title, { detail: f.detail });
    const before = new Set(prev.ports.map((p) => p.port));
    for (const p of ports) if (!before.has(p.port)) addEvent("security", "warn", `Nova porta escutando: ${p.port} (${p.scope})`);
  }
  putSnapshot("security", { ...base, findings } satisfies SecuritySnapshot);
}
