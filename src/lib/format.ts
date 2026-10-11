const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function bytes(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: i >= 3 ? digits : 0 })} ${units[i]}`;
}

export function gb(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return nf1.format(n / 1e9);
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return digits ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : nf0.format(n);
}

/** 1234567 → "1,2 M" */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${nf1.format(n / 1e9)} B`;
  if (Math.abs(n) >= 1e6) return `${nf1.format(n / 1e6)} M`;
  if (Math.abs(n) >= 1e3) return `${nf1.format(n / 1e3)} mil`;
  return nf0.format(n);
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function seconds(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  if (s < 1) return `${nf0.format(s * 1000)} ms`;
  if (s < 90) return `${nf1.format(s)} s`;
  if (s < 5400) return `${nf0.format(s / 60)} min`;
  return `${nf1.format(s / 3600)} h`;
}

export function ago(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return "nunca";
  const d = Math.max(0, (now - ts) / 1000);
  if (d < 10) return "agora";
  if (d < 60) return `há ${Math.floor(d)} s`;
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return `há ${Math.floor(d / 86400)} d`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** "há 2 d 4 h" a partir de "2026-10-08 09:33:12" (uptime -s) */
export function uptimeSince(booted: string | null | undefined): string {
  if (!booted) return "—";
  const t = Date.parse(booted.replace(" ", "T"));
  if (!Number.isFinite(t)) return "—";
  const h = Math.floor((Date.now() - t) / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`;
}

export const stateLabel = (s: string) =>
  ({ running: "rodando", exited: "parado", paused: "pausado", restarting: "reiniciando", created: "criado", dead: "morto" })[s] ?? s;
