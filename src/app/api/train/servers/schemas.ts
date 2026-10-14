import { z } from "zod";
import type { servers } from "@/server/db/schema";

/** Tipos de servidor: local (a máquina do icewall) ou ssh (remoto). */
export const serverTipo = z.enum(["local", "ssh"]);

/** Texto que pode ser omitido ou chegar vazio (normalizado para null). */
const optionalText = (max: number) =>
  z.union([z.literal(""), z.string().min(1).max(max)]).optional();

/**
 * Payload de criação. Em servidor SSH, host/usuario/chaveSshPath são
 * obrigatórios; em local, são ignorados. `chaveSshPath` e `vllmKey` só
 * entram — nunca aparecem em nenhuma resposta de GET (safeServer).
 */
export const createServerBody = z
  .object({
    nome: z.string().min(1).max(64),
    tipo: serverTipo,
    host: z.string().min(1).max(253).optional(),
    porta: z.number().int().min(1).max(65535).optional(),
    usuario: z.string().min(1).max(128).optional(),
    chaveSshPath: optionalText(1024),
    vllmUrl: optionalText(512),
    vllmKey: optionalText(1024),
    capacidades: z.record(z.string(), z.boolean()).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo !== "ssh") return;
    if (!v.host) {
      ctx.addIssue({ code: "custom", path: ["host"], message: "host é obrigatório para servidor SSH" });
    }
    if (!v.usuario) {
      ctx.addIssue({ code: "custom", path: ["usuario"], message: "usuario é obrigatório para servidor SSH" });
    }
    if (!v.chaveSshPath) {
      ctx.addIssue({ code: "custom", path: ["chaveSshPath"], message: "chaveSshPath é obrigatório para servidor SSH" });
    }
  });

/** Payload de atualização parcial (mesmas regras de sigilo). */
export const updateServerBody = z.object({
  nome: z.string().min(1).max(64).optional(),
  tipo: serverTipo.optional(),
  host: z.string().min(1).max(253).optional(),
  porta: z.number().int().min(1).max(65535).nullable().optional(),
  usuario: z.string().min(1).max(128).nullable().optional(),
  chaveSshPath: optionalText(1024),
  vllmUrl: optionalText(512),
  vllmKey: optionalText(1024),
  capacidades: z.record(z.string(), z.boolean()).nullable().optional(),
});

export type CreateServerInput = z.infer<typeof createServerBody>;
export type UpdateServerInput = z.infer<typeof updateServerBody>;

type ServerRow = (typeof servers.$inferSelect);

/**
 * Projeção segura para GET (listagem e detalhe): sem `chaveSshPath` e sem
 * `vllmKey`. É a ÚNICA forma de devolver um servidor em qualquer GET.
 */
export interface SafeServer {
  id: number;
  nome: string;
  tipo: "local" | "ssh";
  host: string;
  porta: number | null;
  usuario: string | null;
  vllmUrl: string | null;
  capacidades: Record<string, boolean> | null;
  ultimoStatus: string | null;
  ultimoCheck: number | null;
  criadoEm: number;
  atualizadoEm: number;
}

export function safeServer(s: ServerRow): SafeServer {
  return {
    id: s.id,
    nome: s.nome,
    tipo: s.tipo,
    host: s.host,
    porta: s.porta,
    usuario: s.usuario,
    vllmUrl: s.vllmUrl,
    capacidades: s.capacidades,
    ultimoStatus: s.ultimoStatus,
    ultimoCheck: s.ultimoCheck,
    criadoEm: s.criadoEm,
    atualizadoEm: s.atualizadoEm,
  };
}
