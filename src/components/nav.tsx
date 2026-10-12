"use client";
import {
  Activity,
  Boxes,
  Coins,
  Cpu,
  Filter,
  FlaskConical,
  Gauge,
  History,
  Layers,
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
  { href: "/bancada", label: "Bancada do Spark", icon: Layers },
  { href: "/delegations", label: "Delegações", icon: Activity },
  { href: "/tokens", label: "Tokens", icon: Coins },
  { href: "/crivo", label: "Crivo", icon: Filter },
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
      className="sticky top-0 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface/80 px-3 py-2.5 backdrop-blur-md md:h-dvh md:w-56 md:flex-col md:items-stretch md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <Link href="/" className="mr-3 flex items-center gap-2.5 px-2 md:mb-6 md:mr-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ice/10 text-ice border border-ice/20">
          <ShieldHalf size={16} />
        </div>
        <span className="text-[17px] font-bold tracking-tight text-ink">ICEWALL</span>
      </Link>
      <div className="flex flex-col gap-0.5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                active ? "bg-surface-2 text-ink shadow-xs border border-line-soft" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink"
              }`}
            >
              <Icon size={15} strokeWidth={1.8} className={active ? "text-ice" : "text-ink-3"} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
