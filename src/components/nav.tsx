"use client";
import {
  Activity,
  Boxes,
  Brain,
  ChevronLeft,
  Coins,
  Cpu,
  Filter,
  FlaskConical,
  Gauge,
  History,
  Layers,
  Network,
  ScanEye,
  Server,
  Settings,
  ShieldHalf,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useServer } from "./server-context";

const SERVER_MANAGEMENT_LINKS = [
  { href: "/", label: "Visão geral", icon: Gauge },
  { href: "/spark", label: "Spark", icon: Cpu },
  { href: "/models", label: "Modelos", icon: Network },
  { href: "/treinar", label: "Treinar", icon: Brain },
  { href: "/bench", label: "Benchmarks", icon: FlaskConical },
  { href: "/bancada", label: "Bancada do Spark", icon: Layers },
  { href: "/terminal", label: "Shell ao Vivo", icon: Terminal },
  { href: "/delegations", label: "Delegações", icon: Activity },
  { href: "/tokens", label: "Tokens", icon: Coins },
  { href: "/crivo", label: "Crivo", icon: Filter },
  { href: "/system", label: "Sistema", icon: ShieldHalf },
  { href: "/containers", label: "Containers", icon: Boxes },
  { href: "/auditor", label: "Auditor", icon: ScanEye },
  { href: "/actions", label: "Ações", icon: History },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  const { activeServer, clearActiveServer } = useServer();

  // Quando na página de servidores ou quando nenhum servidor está selecionado
  const isServersPage = path === "/servers";
  const hasActiveServer = Boolean(activeServer) && !isServersPage;

  return (
    <nav
      aria-label="Seções"
      className="sticky top-0 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface/80 px-3 py-2.5 backdrop-blur-md md:h-dvh md:w-56 md:flex-col md:items-stretch md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <Link href="/servers" className="mr-3 flex items-center gap-2.5 px-2 md:mb-5 md:mr-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ice/10 text-ice border border-ice/20">
          <ShieldHalf size={16} />
        </div>
        <span className="text-[17px] font-bold tracking-tight text-ink">ICEWALL</span>
      </Link>

      {/* Se há servidor selecionado, mostra mini-card com opção de trocar */}
      {hasActiveServer && activeServer && (
        <div className="mb-4 hidden rounded-xl border border-line bg-surface-2/60 p-2.5 md:block">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Servidor Ativo</span>
            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>
          <div className="text-xs font-semibold text-ink truncate mb-0.5" title={activeServer.name}>
            {activeServer.name}
          </div>
          <div className="text-[10px] font-mono text-ink-3 truncate mb-2">
            {activeServer.sshHost || activeServer.endpoint}
          </div>
          <Link
            href="/servers"
            onClick={clearActiveServer}
            className="flex items-center justify-center gap-1 w-full py-1 px-2 rounded-lg bg-surface border border-line text-[11px] font-medium text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={13} />
            <span>Trocar Servidor</span>
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {/* Item Meus Servidores */}
        <Link
          href="/servers"
          aria-current={isServersPage ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
            isServersPage ? "bg-surface-2 text-ink shadow-xs border border-line-soft" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink"
          }`}
        >
          <Server size={15} strokeWidth={1.8} className={isServersPage ? "text-ice" : "text-ink-3"} aria-hidden />
          Meus Servidores
        </Link>

        {/* Demais opções só abrem quando um servidor está selecionado */}
        {hasActiveServer && (
          <>
            <div className="my-2 border-t border-line-soft/80" />
            {SERVER_MANAGEMENT_LINKS.map(({ href, label, icon: Icon }) => {
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
          </>
        )}
      </div>
    </nav>
  );
}
