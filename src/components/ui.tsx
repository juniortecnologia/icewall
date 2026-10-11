"use client";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, ScanEye } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAction } from "@/lib/api";

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="wide text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-[70ch] text-ink-2">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  voice = "ice",
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** "aurora" marca conteúdo que vem do julgamento da Jev */
  voice?: "ice" | "aurora";
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border bg-surface ${voice === "aurora" ? "border-aurora-dim/70" : "border-line-soft"} ${className}`}
    >
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h2 className={`flex items-center gap-2 text-[13px] font-semibold ${voice === "aurora" ? "text-aurora" : "text-ink"}`}>
            {voice === "aurora" && <ScanEye size={14} aria-hidden />}
            {title}
          </h2>
          {aside && <div className="text-[12px] text-ink-3">{aside}</div>}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export type Level = "good" | "warning" | "serious" | "critical" | "info";

const LEVEL: Record<Level, { icon: typeof Info; cls: string; label: string }> = {
  good: { icon: CheckCircle2, cls: "text-good", label: "ok" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "atenção" },
  serious: { icon: AlertTriangle, cls: "text-serious", label: "sério" },
  critical: { icon: AlertOctagon, cls: "text-critical", label: "crítico" },
  info: { icon: Info, cls: "text-ink-2", label: "info" },
};

export const severityLevel = (s: string): Level => (s === "crit" ? "critical" : s === "warn" ? "warning" : "info");

/** Status nunca só por cor: ícone + rótulo. */
export function Status({ level, label, className = "" }: { level: Level; label?: ReactNode; className?: string }) {
  const { icon: Icon, cls, label: def } = LEVEL[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${cls} ${className}`}>
      <Icon size={13} strokeWidth={2} aria-hidden />
      <span className={level === "info" ? "text-ink-2" : ""}>{label ?? def}</span>
    </span>
  );
}

export function Readout({
  label,
  value,
  unit,
  sub,
  level,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  level?: Level;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`readout text-[26px] font-medium leading-none ${level && level !== "good" && level !== "info" ? LEVEL[level].cls : "text-ink"}`}>
          {value}
        </span>
        {unit && <span className="text-[13px] text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 truncate text-[12px] text-ink-2">{sub}</div>}
    </div>
  );
}

export function Meter({ value, max = 1, tone = "ice", label }: { value: number; max?: number; tone?: "ice" | "aurora" | Level; label: string }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  const color =
    tone === "ice" ? "bg-ice" : tone === "aurora" ? "bg-aurora" : tone === "good" ? "bg-good" : tone === "warning" ? "bg-warning" : tone === "critical" ? "bg-critical" : tone === "serious" ? "bg-serious" : "bg-ink-3";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function Table({ head, children, dense = false }: { head: ReactNode[]; children: ReactNode; dense?: boolean }) {
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-[12px] text-ink-3">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`whitespace-nowrap px-3 font-medium ${dense ? "py-1.5" : "py-2"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line-soft/60 [&>tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-ink-3">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-[13px] text-ink">
      <AlertOctagon size={15} className="mt-0.5 shrink-0 text-critical" aria-hidden />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Loading({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-[13px] text-ink-3" role="status">
      <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> {label}…
    </div>
  );
}

/** Probabilidade de "sim" da Jev → rótulo; perto de 0,5 é incerto, não "não" (mesma margem das regras). */
export function yesNo(p: number, yes = "sim", no = "não", unsure = "incerto"): string {
  return p >= 0.65 ? yes : p <= 0.35 ? no : unsure;
}

/** Juízo da Jev: sempre na voz "aurora" e com a probabilidade junto. */
export function Jev({ label, p, title }: { label: string; p?: number | null; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded border border-aurora-dim bg-aurora/10 px-1.5 py-px text-[11.5px] text-aurora"
    >
      {label}
      {typeof p === "number" && <span className="tnum text-aurora/70">{Math.round(p * 100)}%</span>}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-soft bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-[12px] ${value === o.value ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "default",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  type?: "button" | "submit";
}) {
  const cls =
    tone === "primary"
      ? "border-ice-dim bg-ice/15 text-ice hover:bg-ice/25"
      : tone === "danger"
        ? "border-critical/50 bg-critical/10 text-critical hover:bg-critical/20"
        : "border-line bg-surface-2 text-ink hover:bg-surface-3";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

/**
 * Ação no Spark com confirmação em linha: o primeiro clique mostra o que vai acontecer,
 * o segundo executa. A saída aparece logo abaixo.
 */
export function ActionButton({
  action,
  target,
  arg,
  label,
  confirm,
  danger = false,
  needsConfirm = true,
}: {
  action: string;
  target: string;
  arg?: string;
  label: string;
  confirm?: string;
  danger?: boolean;
  needsConfirm?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const m = useAction();
  const run = () => {
    setAsking(false);
    m.mutate({ action, target, arg });
  };
  return (
    <span className="inline-flex flex-col gap-1">
      {asking ? (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink-2">{confirm ?? `${label}: ${target}?`}</span>
          <Button tone={danger ? "danger" : "primary"} onClick={run}>
            Confirmar
          </Button>
          <Button onClick={() => setAsking(false)}>Cancelar</Button>
        </span>
      ) : (
        <Button tone={danger ? "danger" : "default"} disabled={m.isPending} onClick={() => (needsConfirm ? setAsking(true) : run())}>
          {m.isPending && <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {label}
        </Button>
      )}
      {m.data && !m.data.ok && <span className="max-w-[40ch] text-[12px] text-critical">{m.data.output}</span>}
      {m.error && <span className="text-[12px] text-critical">{String(m.error.message)}</span>}
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="block overflow-x-auto whitespace-pre rounded-md border border-line-soft bg-bg px-3 py-2 font-mono text-[12px] text-ink-2">
      {children}
    </code>
  );
}

export function Kv({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
