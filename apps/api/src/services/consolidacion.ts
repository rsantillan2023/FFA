import { ConsolidacionGrupoModel, registrarAuditoria, type ConsolidacionGrupoDocument } from "@ffa/db";
import type {
  ComparacionCarteraItemDto,
  ConsolidacionGrupoDto,
  ConsolidacionGrupoListItemDto,
} from "@ffa/shared";
import { Types } from "mongoose";
import { compararCartera } from "./comparacion.js";

function sumField(items: ComparacionCarteraItemDto[], key: keyof ComparacionCarteraItemDto): number {
  return items.reduce((acc, item) => {
    const v = item[key];
    return acc + (typeof v === "number" ? v : 0);
  }, 0);
}

function mapIndicadores(record: Map<string, number> | Record<string, number | null | undefined>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (record instanceof Map) {
    for (const [k, v] of record.entries()) out[k] = v ?? null;
  } else {
    for (const [k, v] of Object.entries(record)) out[k] = v ?? null;
  }
  return out;
}

function mapItem(item: ComparacionCarteraItemDto): ComparacionCarteraItemDto {
  return {
    fichaId: item.fichaId,
    casoId: item.casoId,
    contribuyenteId: item.contribuyenteId,
    contribuyenteNombre: item.contribuyenteNombre,
    ejercicio: item.ejercicio,
    activoCorriente: item.activoCorriente,
    pasivoCorriente: item.pasivoCorriente,
    patrimonio: item.patrimonio,
    utilidad: item.utilidad,
    indicadores: item.indicadores ?? {},
  };
}

function mapDocument(doc: ConsolidacionGrupoDocument): ConsolidacionGrupoDto {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    planCuentasVersionId: doc.planCuentasVersionId.toString(),
    periodosCount: doc.periodosCount,
    empresasCount: doc.empresasCount,
    fichaIds: doc.fichaIds.map((id) => id.toString()),
    creadoAt: doc.createdAt.toISOString(),
    totales: {
      activoCorriente: doc.totales?.activoCorriente ?? 0,
      pasivoCorriente: doc.totales?.pasivoCorriente ?? 0,
      patrimonio: doc.totales?.patrimonio ?? 0,
      utilidad: doc.totales?.utilidad ?? 0,
    },
    indicadoresAgregados: mapIndicadores(doc.indicadoresAgregados ?? {}),
    items: (doc.items ?? []).map((item) =>
      mapItem({
        fichaId: item.fichaId.toString(),
        casoId: item.casoId.toString(),
        contribuyenteId: item.contribuyenteId?.toString(),
        contribuyenteNombre: item.contribuyenteNombre ?? undefined,
        ejercicio: item.ejercicio ?? undefined,
        activoCorriente: item.activoCorriente ?? undefined,
        pasivoCorriente: item.pasivoCorriente ?? undefined,
        patrimonio: item.patrimonio ?? undefined,
        utilidad: item.utilidad ?? undefined,
        indicadores: mapIndicadores(item.indicadores ?? {}),
      })
    ),
  };
}

function buildResult(
  nombre: string,
  fichaIds: string[],
  cartera: Awaited<ReturnType<typeof compararCartera>>
): Omit<ConsolidacionGrupoDto, "id" | "creadoAt"> {
  const totales = {
    activoCorriente: sumField(cartera.items, "activoCorriente"),
    pasivoCorriente: sumField(cartera.items, "pasivoCorriente"),
    patrimonio: sumField(cartera.items, "patrimonio"),
    utilidad: sumField(cartera.items, "utilidad"),
  };

  const indicadoresAgregados: Record<string, number | null> = {};
  const indCodes = new Set<string>();
  for (const item of cartera.items) {
    for (const code of Object.keys(item.indicadores)) indCodes.add(code);
  }
  for (const code of indCodes) {
    const vals = cartera.items
      .map((i) => i.indicadores[code])
      .filter((v): v is number => v != null);
    indicadoresAgregados[code] = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  }

  return {
    nombre,
    planCuentasVersionId: cartera.planCuentasVersionId,
    periodosCount: cartera.items.length,
    empresasCount: new Set(cartera.items.map((i) => i.contribuyenteId).filter(Boolean)).size,
    fichaIds,
    totales,
    indicadoresAgregados,
    items: cartera.items,
  };
}

export async function consolidarGrupo(
  nombre: string,
  fichaIds: string[],
  userId?: string
): Promise<ConsolidacionGrupoDto> {
  const cartera = await compararCartera(fichaIds);
  const payload = buildResult(nombre, fichaIds, cartera);

  const doc = await ConsolidacionGrupoModel.create({
    nombre: payload.nombre,
    fichaIds: fichaIds.map((id) => new Types.ObjectId(id)),
    planCuentasVersionId: new Types.ObjectId(payload.planCuentasVersionId),
    periodosCount: payload.periodosCount,
    empresasCount: payload.empresasCount,
    totales: payload.totales,
    indicadoresAgregados: payload.indicadoresAgregados,
    items: payload.items.map((item) => ({
      fichaId: new Types.ObjectId(item.fichaId),
      casoId: new Types.ObjectId(item.casoId),
      contribuyenteId: item.contribuyenteId ? new Types.ObjectId(item.contribuyenteId) : undefined,
      contribuyenteNombre: item.contribuyenteNombre,
      ejercicio: item.ejercicio,
      activoCorriente: item.activoCorriente,
      pasivoCorriente: item.pasivoCorriente,
      patrimonio: item.patrimonio,
      utilidad: item.utilidad,
      indicadores: item.indicadores,
    })),
    creadoPor: userId ? new Types.ObjectId(userId) : undefined,
  });

  if (userId) {
    await registrarAuditoria({
      actorTipo: "usuario",
      actorId: userId,
      entidad: "consolidacion_grupo",
      entidadId: doc._id.toString(),
      accion: "consolidacion_grupo_creada",
      payload: {
        nombre,
        fichaIds,
        empresasCount: payload.empresasCount,
      },
    });
  }

  return mapDocument(doc);
}

export async function listConsolidaciones(
  page = 1,
  limit = 20
): Promise<{ items: ConsolidacionGrupoListItemDto[]; total: number; page: number; limit: number }> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    ConsolidacionGrupoModel.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("nombre empresasCount periodosCount totales createdAt"),
    ConsolidacionGrupoModel.countDocuments(),
  ]);

  return {
    items: docs.map((doc) => ({
      id: doc._id.toString(),
      nombre: doc.nombre,
      empresasCount: doc.empresasCount,
      periodosCount: doc.periodosCount,
      patrimonioTotal: doc.totales?.patrimonio ?? 0,
      creadoAt: doc.createdAt.toISOString(),
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function getConsolidacionById(id: string): Promise<ConsolidacionGrupoDto | null> {
  const doc = await ConsolidacionGrupoModel.findById(id);
  if (!doc) return null;
  return mapDocument(doc);
}
