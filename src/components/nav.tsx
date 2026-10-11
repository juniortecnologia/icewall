"use client";
import {
  Activity,
  Boxes,
  Coins,
  Cpu,
  FlaskConical,
  Gauge,
  History,
  Network,
  ScanEye,
  ShieldHalf,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Visão geral", icon: Gauge },
  { href: "/spark", label: "Spark", icon: Cpu },
  { href: "/models", label: "Modelos", icon: Network },
  { href: "/bench", label: "Benchmarks", icon: FlaskConical },
  { href: "/delegations", label: "Delegações", icon: Activity },
  { href: "/tokens", label: "Tokens", icon: Coins },
  { href: "/system", label: "Sistema", icon: ShieldHalf },
  { href: "/containers", label: "Containers", icon: Boxes },
  { href: "/auditor", label: "Auditor", icon: ScanEye },
  { href: "/actions", label: "Ações", icon: History },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Seções"
      className="sticky top-0 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-soft bg-bg/95 px-3 py-2 backdrop-blur md:h-dvh md:w-52 md:flex-col md:items-stretch md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-5"
    >
      <Link href="/" className="mr-3 flex items-baseline gap-2 px-2 md:mb-6 md:mr-0">
        <span className="readout text-[17px] font-semibold tracking-tight text-ice">ICEWALL</span>
      </Link>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
              active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon size={15} strokeWidth={1.75} className={active ? "text-ice" : "text-ink-3"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
