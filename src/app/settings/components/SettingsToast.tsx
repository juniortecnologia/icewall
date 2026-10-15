"use client";

import { CheckCircle, XCircle } from "lucide-react";

interface SettingsToastProps {
  message: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
}

export function SettingsToast({ message, onClose }: SettingsToastProps) {
  if (!message) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl border flex items-center gap-2.5 text-xs font-medium backdrop-blur-md transition-all ${
        message.type === "success"
          ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
          : "bg-rose-950/80 border-rose-500/40 text-rose-200"
      }`}
    >
      {message.type === "success" ? (
        <CheckCircle className="w-4 h-4 text-emerald-400" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-400" />
      )}
      <span>{message.text}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 text-[10px]">
        ×
      </button>
    </div>
  );
}