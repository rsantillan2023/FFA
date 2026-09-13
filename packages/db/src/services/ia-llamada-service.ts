import { Types } from "mongoose";
import { IaLlamadaModel } from "../models/ia-llamada.js";

export type RegistrarIaLlamadaInput = {
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
  exito?: boolean;
  error?: string;
  detalle?: Record<string, unknown>;
};

export async function registrarIaLlamada(input: RegistrarIaLlamadaInput): Promise<void> {
  await IaLlamadaModel.create({
    actorTipo: input.actorTipo,
    actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
    casoId: input.casoId ? new Types.ObjectId(input.casoId) : undefined,
    documentoId: input.documentoId ? new Types.ObjectId(input.documentoId) : undefined,
    proveedor: input.proveedor,
    modelo: input.modelo,
    funcion: input.funcion,
    tokensEntrada: input.tokensEntrada,
    tokensSalida: input.tokensSalida,
    costeUsdEstimado: input.costeUsdEstimado,
    duracionMs: input.duracionMs,
    exito: input.exito ?? true,
    error: input.error,
    detalle: input.detalle ?? {},
  });
}

export type ListarIaLlamadasFiltro = {
  limit?: number;
  actorId?: string;
  casoId?: string;
  proveedor?: string;
  funcion?: string;
  desde?: Date;
  hasta?: Date;
};

export async function listarIaLlamadas(filtro: ListarIaLlamadasFiltro = {}) {
  const limit = Math.min(500, Math.max(1, filtro.limit ?? 100));
  const query: Record<string, unknown> = {};

  if (filtro.actorId) query.actorId = new Types.ObjectId(filtro.actorId);
  if (filtro.casoId) query.casoId = new Types.ObjectId(filtro.casoId);
  if (filtro.proveedor) query.proveedor = filtro.proveedor;
  if (filtro.funcion) query.funcion = filtro.funcion;
  if (filtro.desde || filtro.hasta) {
    query.at = {};
    if (filtro.desde) (query.at as Record<string, Date>).$gte = filtro.desde;
    if (filtro.hasta) (query.at as Record<string, Date>).$lte = filtro.hasta;
  }

  return IaLlamadaModel.find(query).sort({ at: -1 }).limit(limit).populate("actorId", "nombre email");
}

export async function resumenIaLlamadas(filtro: Omit<ListarIaLlamadasFiltro, "limit"> = {}) {
  const match: Record<string, unknown> = {};
  if (filtro.actorId) match.actorId = new Types.ObjectId(filtro.actorId);
  if (filtro.casoId) match.casoId = new Types.ObjectId(filtro.casoId);
  if (filtro.proveedor) match.proveedor = filtro.proveedor;
  if (filtro.funcion) match.funcion = filtro.funcion;
  if (filtro.desde || filtro.hasta) {
    match.at = {};
    if (filtro.desde) (match.at as Record<string, Date>).$gte = filtro.desde;
    if (filtro.hasta) (match.at as Record<string, Date>).$lte = filtro.hasta;
  }

  const [totales, porFuncion, porProveedor, porDia] = await Promise.all([
    IaLlamadaModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalLlamadas: { $sum: 1 },
          tokensEntrada: { $sum: "$tokensEntrada" },
          tokensSalida: { $sum: "$tokensSalida" },
          costeUsdEstimado: { $sum: "$costeUsdEstimado" },
          exitosas: { $sum: { $cond: ["$exito", 1, 0] } },
          fallidas: { $sum: { $cond: ["$exito", 0, 1] } },
        },
      },
    ]),
    IaLlamadaModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$funcion",
          llamadas: { $sum: 1 },
          costeUsdEstimado: { $sum: "$costeUsdEstimado" },
          tokensEntrada: { $sum: "$tokensEntrada" },
          tokensSalida: { $sum: "$tokensSalida" },
        },
      },
      { $sort: { costeUsdEstimado: -1 } },
    ]),
    IaLlamadaModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$proveedor",
          llamadas: { $sum: 1 },
          costeUsdEstimado: { $sum: "$costeUsdEstimado" },
        },
      },
    ]),
    IaLlamadaModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } },
          llamadas: { $sum: 1 },
          costeUsdEstimado: { $sum: "$costeUsdEstimado" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]),
  ]);

  const t = totales[0] ?? {
    totalLlamadas: 0,
    tokensEntrada: 0,
    tokensSalida: 0,
    costeUsdEstimado: 0,
    exitosas: 0,
    fallidas: 0,
  };

  return {
    totalLlamadas: t.totalLlamadas as number,
    tokensEntrada: t.tokensEntrada as number,
    tokensSalida: t.tokensSalida as number,
    costeUsdEstimado: Math.round((t.costeUsdEstimado as number) * 1_000_000) / 1_000_000,
    exitosas: t.exitosas as number,
    fallidas: t.fallidas as number,
    porFuncion: porFuncion.map((r) => ({
      funcion: r._id as string,
      llamadas: r.llamadas as number,
      costeUsdEstimado: Math.round((r.costeUsdEstimado as number) * 1_000_000) / 1_000_000,
      tokensEntrada: r.tokensEntrada as number,
      tokensSalida: r.tokensSalida as number,
    })),
    porProveedor: porProveedor
      .map((r) => ({
        proveedor: r._id as string,
        llamadas: r.llamadas as number,
        costeUsdEstimado: Math.round((r.costeUsdEstimado as number) * 1_000_000) / 1_000_000,
      }))
      .sort((a, b) => b.llamadas - a.llamadas || b.costeUsdEstimado - a.costeUsdEstimado),
    porDia: porDia.map((r) => ({
      dia: r._id as string,
      llamadas: r.llamadas as number,
      costeUsdEstimado: Math.round((r.costeUsdEstimado as number) * 1_000_000) / 1_000_000,
    })),
  };
}
