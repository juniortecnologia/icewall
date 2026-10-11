import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAptUpgradable,
  parseComputeApps,
  parseCudaVersion,
  parseDf,
  parseDockerJsonLines,
  parseDockerMem,
  parseKeyValue,
  parseLoadavg,
  parseMeminfo,
  parseNvidiaGpu,
  parsePercent,
  parseSections,
  parseSize,
  parseSsListen,
  parseSshAuthFailures,
  parseSystemctlFailed,
} from "./index";

const fx = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseSections", () => {
  it("splits output by @@name@@ markers and trims each body", () => {
    const out = "lixo antes\n@@gpu@@\n38, 0\n\n@@load@@\n0.1 0.2 0.3 1/2 3\n@@empty@@\n";
    expect(parseSections(out)).toEqual({ gpu: "38, 0", load: "0.1 0.2 0.3 1/2 3", empty: "" });
  });
  it("returns an empty object when there are no markers", () => {
    expect(parseSections("nada aqui")).toEqual({});
  });
});

describe("parseNvidiaGpu", () => {
  it("parses temperature, utilization, power and SM clock", () => {
    expect(parseNvidiaGpu("38, 0, 10.75, 2398")).toEqual({ temp: 38, util: 0, power: 10.75, clock: 2398 });
  });
  it("maps N/A and [N/A] to null", () => {
    expect(parseNvidiaGpu("[N/A], 5, N/A, 100\n")).toEqual({ temp: null, util: 5, power: null, clock: 100 });
  });
  it("returns null for empty output", () => {
    expect(parseNvidiaGpu("")).toBeNull();
  });
  it("reads the real GB10 fixture", () => {
    expect(parseNvidiaGpu(fx("nvidia-gpu.txt"))).toEqual({ temp: 38, util: 0, power: 10.75, clock: 2398 });
  });
});

describe("parseComputeApps", () => {
  it("parses one app per line", () => {
    expect(parseComputeApps("161710, python, 370\n42, /usr/bin/ollama, [N/A]\n")).toEqual([
      { pid: 161710, name: "python", usedMiB: 370 },
      { pid: 42, name: "/usr/bin/ollama", usedMiB: null },
    ]);
  });
  it("returns [] for empty output or the 'No running processes found' message", () => {
    expect(parseComputeApps("")).toEqual([]);
    expect(parseComputeApps("No running processes found\n")).toEqual([]);
  });
});

describe("parseMeminfo", () => {
  it("converts kB values to bytes", () => {
    const text = "MemTotal:       127598548 kB\nMemFree:  1 kB\nMemAvailable:   123547840 kB\nSwapTotal:      16777212 kB\nSwapFree:       15104192 kB\n";
    expect(parseMeminfo(text)).toEqual({
      memTotal: 127598548 * 1024,
      memAvailable: 123547840 * 1024,
      swapTotal: 16777212 * 1024,
      swapFree: 15104192 * 1024,
    });
  });
  it("reads the real fixture", () => {
    const m = parseMeminfo(fx("meminfo.txt"));
    expect(m.memTotal).toBeGreaterThan(100 * 1024 ** 3);
    expect(m.memAvailable).toBeLessThanOrEqual(m.memTotal);
  });
  it("uses 0 for missing fields", () => {
    expect(parseMeminfo("MemTotal: 10 kB\n")).toEqual({ memTotal: 10240, memAvailable: 0, swapTotal: 0, swapFree: 0 });
  });
});

describe("parseLoadavg", () => {
  it("reads the first three numbers", () => {
    expect(parseLoadavg("0.15 0.08 0.03 1/1234 56789\n")).toEqual({ load1: 0.15, load5: 0.08, load15: 0.03 });
  });
});

describe("parseDf", () => {
  it("reads size and used of the first data line (df -B1 --output=size,used,target)", () => {
    const text = "     1B-blocks         Used Mounted on\n4031871553536 429544394752 /\n";
    expect(parseDf(text)).toEqual({ total: 4031871553536, used: 429544394752 });
  });
  it("returns null without a data line", () => {
    expect(parseDf("     1B-blocks Used Mounted on\n")).toBeNull();
  });
});

describe("parseDockerJsonLines", () => {
  it("parses one JSON object per line and skips blank or invalid lines", () => {
    expect(parseDockerJsonLines('{"a":1}\n\nnot json\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("reads the real docker ps fixture", () => {
    const rows = parseDockerJsonLines(fx("docker-ps.txt"));
    expect(rows.length).toBe(6);
    expect(rows.map((r) => r.Names)).toContain("ollama");
  });
});

describe("parseSize", () => {
  it("converts docker/human sizes to bytes (binary for iB, decimal otherwise)", () => {
    expect(parseSize("212.6MiB")).toBeCloseTo(212.6 * 1024 ** 2);
    expect(parseSize("121.7GiB")).toBeCloseTo(121.7 * 1024 ** 3);
    expect(parseSize("4.19GB")).toBeCloseTo(4.19e9);
    expect(parseSize("177MB")).toBeCloseTo(177e6);
    expect(parseSize("951kB")).toBeCloseTo(951e3);
    expect(parseSize("12B")).toBe(12);
    expect(parseSize("0B")).toBe(0);
  });
  it("returns null for unparseable input", () => {
    expect(parseSize("--")).toBeNull();
    expect(parseSize("")).toBeNull();
  });
});

describe("parseDockerMem", () => {
  it("returns used and limit bytes from 'used / limit'", () => {
    const r = parseDockerMem("741.2MiB / 121.7GiB");
    expect(r?.used).toBeCloseTo(741.2 * 1024 ** 2);
    expect(r?.limit).toBeCloseTo(121.7 * 1024 ** 3);
  });
  it("returns null when malformed", () => {
    expect(parseDockerMem("n/a")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("parses '12.34%' and returns null for '--'", () => {
    expect(parsePercent("12.34%")).toBe(12.34);
    expect(parsePercent("0.00%")).toBe(0);
    expect(parsePercent("--")).toBeNull();
  });
});

describe("parseAptUpgradable", () => {
  it("parses packages and flags security suites, skipping the Listing header", () => {
    const text =
      "Listing...\n" +
      "bluez/noble-updates,noble-security 5.72-0ubuntu5.7 arm64 [upgradable from: 5.72-0ubuntu5.5]\n" +
      "dnsmasq/noble-updates 2.91-0ubuntu0.24.04.2 all [upgradable from: 2.91-0ubuntu0.24.04.1]\n";
    expect(parseAptUpgradable(text)).toEqual([
      { name: "bluez", suites: ["noble-updates", "noble-security"], version: "5.72-0ubuntu5.7", arch: "arm64", from: "5.72-0ubuntu5.5", security: true },
      { name: "dnsmasq", suites: ["noble-updates"], version: "2.91-0ubuntu0.24.04.2", arch: "all", from: "2.91-0ubuntu0.24.04.1", security: false },
    ]);
  });
  it("accepts lines without the 'upgradable from' part", () => {
    expect(parseAptUpgradable("foo/noble 1.0 arm64\n")).toEqual([
      { name: "foo", suites: ["noble"], version: "1.0", arch: "arm64", from: null, security: false },
    ]);
  });
  it("reads the real fixture (24 packages)", () => {
    const pkgs = parseAptUpgradable(fx("apt-upgradable.txt"));
    expect(pkgs.length).toBe(24);
    expect(pkgs.some((p) => p.security)).toBe(true);
  });
});

describe("parseSsListen", () => {
  it("groups by port, merges IPv4/IPv6 addresses and classifies scope", () => {
    const text =
      "LISTEN 0      4096         0.0.0.0:11434 0.0.0.0:*\n" +
      "LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*\n" +
      "LISTEN 0      4096       127.0.0.1:631   0.0.0.0:*\n" +
      "LISTEN 0      4096      127.0.0.54:53    0.0.0.0:*\n" +
      "LISTEN 0      4096       10.0.5.18:9000  0.0.0.0:*\n" +
      "LISTEN 0      4096            [::]:11434    [::]:*\n" +
      "LISTEN 0      4096           [::1]:631      [::]:*\n";
    expect(parseSsListen(text)).toEqual([
      { port: 53, addresses: ["127.0.0.53%lo", "127.0.0.54"], scope: "loopback" },
      { port: 631, addresses: ["127.0.0.1", "::1"], scope: "loopback" },
      { port: 9000, addresses: ["10.0.5.18"], scope: "specific" },
      { port: 11434, addresses: ["0.0.0.0", "::"], scope: "any" },
    ]);
  });
  it("reads the real fixture", () => {
    const ports = parseSsListen(fx("ss.txt")).map((p) => p.port);
    expect(ports).toEqual([22, 53, 631, 8188, 11000, 11434]);
  });
});

describe("parseKeyValue", () => {
  it("parses os-release style KEY=value with optional quotes, skipping comments", () => {
    expect(parseKeyValue('# c\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n\n')).toEqual({
      NAME: "Ubuntu",
      VERSION_ID: "24.04",
      ID: "ubuntu",
    });
  });
});

describe("parseCudaVersion", () => {
  it("extracts the CUDA version from the nvidia-smi header", () => {
    expect(parseCudaVersion(fx("nvidia-smi.txt"))).toBe("13.0");
    expect(parseCudaVersion("no gpu")).toBeNull();
  });
});

describe("parseSystemctlFailed", () => {
  it("parses failed units", () => {
    expect(parseSystemctlFailed("foo.service loaded failed failed Foo Daemon thing\n")).toEqual([
      { unit: "foo.service", load: "loaded", active: "failed", sub: "failed", description: "Foo Daemon thing" },
    ]);
    expect(parseSystemctlFailed("")).toEqual([]);
  });
});

describe("parseSshAuthFailures", () => {
  it("counts failures, groups by source IP (desc by count) and lists distinct users", () => {
    const text =
      "Oct 10 21:40:35 h sshd[1]: Invalid user junior from 172.16.1.89 port 41542\n" +
      "Oct 10 21:45:13 h sshd[2]: Invalid user admin from 172.16.1.89 port 54784\n" +
      "Oct 10 21:45:14 h sshd[3]: Failed password for facini from 10.0.5.8 port 5 ssh2\n" +
      "Oct 10 21:45:15 h sshd[4]: Failed password for invalid user root from 172.16.1.89 port 6 ssh2\n";
    expect(parseSshAuthFailures(text)).toEqual({
      count: 4,
      byIp: [
        { ip: "172.16.1.89", count: 3 },
        { ip: "10.0.5.8", count: 1 },
      ],
      users: ["junior", "admin", "facini", "root"],
    });
  });
  it("returns zero for empty input", () => {
    expect(parseSshAuthFailures("")).toEqual({ count: 0, byIp: [], users: [] });
  });
});
