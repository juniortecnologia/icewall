"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, ChevronDown, Check } from "lucide-react";
import { SettingsSection } from "./SettingsTypes";

interface SettingsTabsProps {
  sections: SettingsSection[];
  activeTab: SettingsSection["id"];
  onTabChange: (id: SettingsSection["id"]) => void;
}

export function SettingsTabs({ sections, activeTab, onTabChange }: SettingsTabsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-line hover:border-line-soft text-ink font-medium text-xs transition-all shadow-xs cursor-pointer select-none"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="Abrir menu de configurações"
      >
        <Menu className="w-4 h-4 text-ice" />
        <span className="text-ink-3 hidden sm:inline">Módulo:</span>
        <span className="font-semibold text-ink flex items-center gap-1.5">
          {(() => {
            const cur = sections.find((s) => s.id === activeTab) || sections[0];
            const Icon = cur.icon;
            return (
              <>
                <Icon className={`w-3.5 h-3.5 ${cur.color}`} />
                <span>{cur.label}</span>
              </>
            );
          })()}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-3 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div
            ref={dropdownRef}
            className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-surface border border-line p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase border-b border-line mb-1.5 flex items-center justify-between">
              <span>Módulos de Configuração</span>
              <span className="text-[10px] bg-ice/10 text-ice px-1.5 py-0.5 rounded font-mono">{sections.length} Seções</span>
            </div>
            <div className="space-y-1">
              {sections.map((sec) => {
                const Icon = sec.icon;
                const isSelected = activeTab === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      onTabChange(sec.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-surface-2 text-ink border border-line-soft font-semibold shadow-xs"
                        : "hover:bg-surface-2/60 text-ink-2 hover:text-ink border border-transparent"
                    }`}
                  >
                    <div className={`p-2 rounded-lg bg-surface border border-line mt-0.5 shrink-0 ${sec.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">{sec.label}</span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] text-ice font-semibold">
                            <Check className="w-3 h-3" /> Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{sec.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}