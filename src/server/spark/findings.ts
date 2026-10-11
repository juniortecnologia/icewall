/** Achados de segurança a partir do retrato do Spark. Puro: sem banco, sem rede. */
import type { DockerSnapshot, SecurityFinding, SecuritySnapshot } from "@/lib/types";

export const KNOWN_PORTS: Record<number, string> = { 22: "sshd", 53: "systemd-resolved", 631: "cups" };

/** Associa portas publicadas pelo Docker ("0.0.0.0:11434->11434/tcp") ao nome do container. */
export function containerPorts(docker: DockerSnapshot | null | undefined): Map<number, string> {
  const map = new Map<number, string>();
  for (const c of docker?.containers ?? []) {
    for (const m of c.ports.matchAll(/:(\d+)->/g)) map.set(Number(m[1]), `container ${c.name}`);
  }
  return map;
}

/**
 * O Docker publica portas direto no iptables, antes das regras do ufw: `ufw deny/allow` não fecha porta de container.
 * A regra vai na chain DOCKER-USER; o --ctorigdstport casa a porta do host mesmo depois do DNAT.
 */
function containerPortFix(port: number, service: string, clientIp: string | null): string {
  const ip = clientIp ?? "<ip-desta-maquina>";
  const usedHere = /ollama/i.test(service);
  return [
    `# Opção 1: só esta máquina (${ip}) alcança a porta${usedHere ? " (o ICEWALL e o delegate-local daqui usam esta porta)" : ""}`,
    `sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport ${port} --ctdir ORIGINAL ! -s ${ip} -j DROP`,
    `sudo apt install iptables-persistent && sudo netfilter-persistent save   # mantém a regra após o reboot`,
    `# O painel não lê o iptables (precisa de root): depois da opção 1, dispense esta recomendação.`,
    ...(usedHere
      ? []
      : [`# Opção 2: ninguém de fora usa o serviço: recrie o container com -p 127.0.0.1:${port}:${port}`]),
  ].join("\n");
}

export function securityFindings(snap: Omit<SecuritySnapshot, "findings">): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const p of snap.ports) {
    if (p.scope !== "any" || p.port === 22) continue;
    findings.push({
      key: `port:${p.port}`,
      severity: "warn",
      title: `Porta ${p.port} aberta para a rede (${p.service ?? "serviço desconhecido"})`,
      detail: p.service?.startsWith("container")
        ? `Escuta em ${p.addresses.join(" e ")}: qualquer máquina da LAN alcança o serviço. O Docker publica a porta por fora do ufw, então uma regra do ufw não a fecha.`
        : `Escuta em ${p.addresses.join(" e ")}. Qualquer máquina da LAN alcança o serviço; confira se ele exige autenticação.`,
      fix: p.service?.startsWith("container") ? containerPortFix(p.port, p.service, snap.clientIp) : `sudo ufw deny ${p.port}/tcp (ou restringir a origem)`,
    });
  }
  const configured = Object.entries(snap.sshdConfig).find(([k]) => k.toLowerCase() === "passwordauthentication")?.[1];
  // A sonda mostra o que o sshd em execução oferece: pega config sem reload e Match/Include que o grep não vê.
  const offersPassword = snap.passwordAuth ?? (!configured || configured.toLowerCase() === "yes");
  if (offersPassword) {
    const pending = configured?.toLowerCase() === "no";
    findings.push({
      key: "sshd:password",
      severity: "warn",
      title: "SSH aceita login por senha",
      detail: pending
        ? "O arquivo já diz PasswordAuthentication no, mas o sshd em execução ainda oferece senha: falta recarregar o serviço (ou outro arquivo sobrescreve)."
        : "O sshd em execução oferece login por senha (o padrão do OpenSSH é yes). A chave já funciona para o ICEWALL.",
      fix: pending
        ? "sudo sshd -t && sudo systemctl reload ssh; confira com: sudo sshd -T | grep -i passwordauthentication"
        : "echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/10-no-password.conf && sudo sshd -t && sudo systemctl reload ssh",
    });
  }
  if (snap.unattendedActive !== "active") {
    findings.push({
      key: "unattended",
      severity: "warn",
      title: "Updates de segurança automáticos desligados",
      detail: `unattended-upgrades: ${snap.unattendedEnabled || snap.unattendedActive}.`,
      fix: "sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades",
    });
  }
  if (snap.ufwActive !== "active") {
    findings.push({ key: "ufw", severity: "crit", title: "Firewall (ufw) inativo", detail: `ufw: ${snap.ufwActive}`, fix: "sudo ufw enable" });
  }
  if (snap.auth.count > 20) {
    const top = snap.auth.byIp.slice(0, 3).map((i) => `${i.ip} (${i.count})`).join(", ");
    findings.push({
      key: "ssh:bruteforce",
      severity: snap.auth.count > 200 ? "crit" : "warn",
      title: `${snap.auth.count} falhas de login SSH em 24 h`,
      detail: `Origens: ${top}. Usuários tentados: ${snap.auth.users.slice(0, 8).join(", ")}.`,
      fix: "sudo apt install fail2ban",
    });
  }
  for (const u of snap.failedUnits) {
    findings.push({ key: `unit:${u.unit}`, severity: "warn", title: `Serviço com falha: ${u.unit}`, detail: u.description, fix: `systemctl status ${u.unit}` });
  }
  return findings;
}
