"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { send } from "@/lib/api";
import { Button } from "./ui";

interface ApplyButtonProps {
  id: number;
  action: string | null;
  onSuccess?: () => void;
}

export function RecommendationApplyButton({ id, action, onSuccess }: ApplyButtonProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!action) return null;

  // Verifica se é uma recomendação com execução automatizada
  const isTier = action.includes('models.json: "') && action.includes('→');
  const isKeepAlive = action.includes('keep_alive":');
  const isBench = action.toLowerCase().includes("benchmark");

  if (!isTier && !isKeepAlive && !isBench) {
    return null;
  }

  const handleApply = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await send<{ ok: boolean; message: string }>(`/api/recommendations/${id}/apply`, "POST");
      setResult(res);
      await qc.invalidateQueries();
      if (res.ok && onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        tone="primary"
        onClick={handleApply}
        disabled={loading || (result?.ok ?? false)}
      >
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            Aplicando…
          </>
        ) : result?.ok ? (
          <>
            <Check size={13} className="text-good" />
            Aplicado!
          </>
        ) : (
          <>
            <Sparkles size={13} className="text-ice" />
            Aplicar agora
          </>
        )}
      </Button>
      {result && !result.ok && (
        <span className="flex items-center gap-1 text-[11.5px] text-critical">
          <AlertCircle size={12} />
          {result.message}
        </span>
      )}
    </div>
  );
}
