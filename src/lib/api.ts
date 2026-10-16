"use client";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export async function send<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-icewall": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // As rotas do Crivo respondem { erro }, as outras { error }.
  if (!res.ok) throw new Error(data?.error ?? data?.erro ?? `HTTP ${res.status}`);
  return data as T;
}

/** Envio multipart (uploads): mesma proteção x-icewall das mutações JSON. */
export async function sendForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "x-icewall": "1" }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Consulta com polling (padrão 5 s). */
export function useLive<T>(url: string, intervalMs = 5000, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: [url], queryFn: () => getJson<T>(url), refetchInterval: intervalMs, ...opts });
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export function useAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: string; target: string; arg?: string; serverId?: number }) => send<ActionResult>("/api/actions", "POST", v),
    onSettled: () => qc.invalidateQueries(),
  });
}
