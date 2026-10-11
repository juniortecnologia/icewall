import { describe, expect, it } from "vitest";
import { securityFindings } from "./findings";

const base = {
  ports: [],
  failedUnits: [],
  auth: { count: 0, byIp: [], users: [] },
  unattendedActive: "active",
  unattendedEnabled: "enabled",
  ufwActive: "active",
  sshdConfig: {},
  passwordAuth: null,
  clientIp: null,
};

const keys = (s: Parameters<typeof securityFindings>[0]) => securityFindings(s).map((f) => f.key);

describe("securityFindings: sshd", () => {
  it("trusts the live probe over the config files", () => {
    expect(keys({ ...base, sshdConfig: { PasswordAuthentication: "no" }, passwordAuth: true })).toContain("sshd:password");
    expect(keys({ ...base, sshdConfig: {}, passwordAuth: false })).not.toContain("sshd:password");
  });
  it("falls back to the config files when the probe failed", () => {
    expect(keys({ ...base, sshdConfig: {} })).toContain("sshd:password");
    expect(keys({ ...base, sshdConfig: { passwordauthentication: "no" } })).not.toContain("sshd:password");
  });
});

describe("securityFindings: container ports", () => {
  const port = { port: 11434, addresses: ["0.0.0.0", "::"], scope: "any" as const, service: "container ollama" };
  it("does not suggest ufw, which Docker bypasses, and allows this machine", () => {
    const [f] = securityFindings({ ...base, ports: [port], clientIp: "172.16.1.89" });
    expect(f.fix).not.toMatch(/ufw (allow|deny)/);
    expect(f.fix).toContain("DOCKER-USER");
    expect(f.fix).toContain("! -s 172.16.1.89");
    expect(f.fix).toContain("--ctorigdstport 11434");
  });
});
