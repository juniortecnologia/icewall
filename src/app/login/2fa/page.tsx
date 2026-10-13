"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

export default function TwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Código 2FA incorreto");
        return;
      }

      router.push("/servers");
    } catch {
      setError("Erro ao validar o código. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-[#e2e8f0] p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-[#0f172a] border border-[#1e293b] rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Autenticação em 2 Etapas</h1>
          <p className="text-xs text-slate-400 mt-1 text-center">
            Digite o código de 6 dígitos gerado pelo seu aplicativo autenticador (Google Authenticator, Authy, etc.)
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 text-center">
              Código de Verificação (TOTP)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-[#090d16] border border-[#1e293b] rounded-xl text-center text-xl tracking-[0.3em] font-mono font-bold text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="000000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-600/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verificando...</span>
              </>
            ) : (
              <>
                <span>Confirmar e Acessar</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#1e293b] text-center">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}
