import { estimarCosteIaUsd } from "@ffa/shared";
import { getIaContext } from "./ia-context.js";

export type IaLlamadaEmit = {
  proveedor: "openai" | "anthropic";
  modelo: string;
  funcion: string;
  tokensEntrada: number;
  tokensSalida: number;
  duracionMs?: number;
  exito?: boolean;
  error?: string;
  detalle?: Record<string, unknown>;
};

type IaLlamadaHandler = (input: {
  actorTipo: "sistema" | "usuario";
  actorId?: string;
  casoId?: string;
  documentoId?: string;
  proveedor: "openai" | "anthropic";
  modelo: string;
  funcion: string;
  tokensEntrada: number;
  tokensSalida: number;
  costeUsdEstimado: number;
  duracionMs?: number;
  exito: boolean;
  error?: string;
  detalle?: Record<string, unknown>;
}) => void | Promise<void>;

let handler: IaLlamadaHandler | null = null;

export function setIaLlamadaHandler(h: IaLlamadaHandler | null): void {
  handler = h;
}

export async function emitIaLlamada(emit: IaLlamadaEmit): Promise<void> {
  if (!handler) return;

  const ctx = getIaContext();
  const costeUsdEstimado = estimarCosteIaUsd(
    emit.proveedor,
    emit.modelo,
    emit.tokensEntrada,
    emit.tokensSalida
  );

  try {
    await handler({
      actorTipo: ctx?.actorTipo ?? "sistema",
      actorId: ctx?.actorId,
      casoId: ctx?.casoId,
      documentoId: ctx?.documentoId,
      proveedor: emit.proveedor,
      modelo: emit.modelo,
      funcion: emit.funcion,
      tokensEntrada: emit.tokensEntrada,
      tokensSalida: emit.tokensSalida,
      costeUsdEstimado,
      duracionMs: emit.duracionMs,
      exito: emit.exito ?? true,
      error: emit.error,
      detalle: {
        ...(ctx?.documentoNombre ? { documentoNombre: ctx.documentoNombre } : {}),
        ...(ctx?.esRespaldoAnthropic ? { esRespaldoAnthropic: true } : {}),
        ...(emit.detalle ?? {}),
      },
    });
  } catch (e) {
    console.error("[ia-llamada] error al registrar:", e instanceof Error ? e.message : e);
  }
}
