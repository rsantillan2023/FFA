import {
  CasoModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  type CasoDocument,
} from "@ffa/db";
import { CasoEstado } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/auth.js";
import { lecturaEquipo } from "../plugins/rbac.js";

function csvEscape(val: string | number | undefined | null): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function buildRepositorioQuery(query: Record<string, string | undefined>) {
  const incluirRechazados = query.incluirRechazados === "true";
  const casoFilter: Record<string, unknown> = incluirRechazados
    ? {}
    : { estado: { $in: [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO] } };

  if (query.contribuyenteId) casoFilter.contribuyenteId = query.contribuyenteId;
  if (query.ejercicio) casoFilter["periodo.ejercicio"] = Number(query.ejercicio);
  if (query.estado) casoFilter.estado = query.estado;
  if (query.canal) casoFilter.canal = query.canal;
  if (query.asignadoA) casoFilter.asignadoA = query.asignadoA;

  if (query.fechaDesde || query.fechaHasta) {
    const createdAt: Record<string, Date> = {};
    if (query.fechaDesde) createdAt.$gte = new Date(query.fechaDesde);
    if (query.fechaHasta) createdAt.$lte = new Date(query.fechaHasta);
    casoFilter.createdAt = createdAt;
  }

  if (query.q?.trim()) {
    const term = query.q.trim();
    const contribFilter = term.match(/^\d/)
      ? { rut: new RegExp(term.replace(/\./g, ""), "i") }
      : { razonSocial: new RegExp(term, "i") };
    const contribs = await ContribuyenteModel.find(contribFilter).limit(50);
    if (!contribs.length) {
      return { casoFilter: { _id: null }, emptySearch: true };
    }
    casoFilter.contribuyenteId = { $in: contribs.map((c) => c._id) };
  }

  return { casoFilter, emptySearch: false };
}

async function mapRepositorioItems(casos: CasoDocument[]) {
  const fichaIds = await FichaCanonicaModel.find({
    casoId: { $in: casos.map((c) => c._id) },
    estado: "aprobada",
  });
  const fichaMap = new Map(fichaIds.map((f) => [f.casoId.toString(), f]));

  const contribIds = casos.map((c) => c.contribuyenteId).filter(Boolean);
  const contribs = await ContribuyenteModel.find({ _id: { $in: contribIds } });
  const contribMap = new Map(
    contribs.map((c) => [c._id.toString(), { nombre: c.razonSocial, rut: c.rut }])
  );

  const docs = await DocumentoFuenteModel.find({
    casoId: { $in: casos.map((c) => c._id) },
  }).sort({ createdAt: 1 });
  const docMap = new Map<string, (typeof docs)[0]>();
  for (const d of docs) {
    if (!docMap.has(d.casoId.toString())) docMap.set(d.casoId.toString(), d);
  }

  return casos.map((c) => {
    const contrib = c.contribuyenteId
      ? contribMap.get(c.contribuyenteId.toString())
      : undefined;
    const doc = docMap.get(c._id.toString());
    return {
      casoId: c._id.toString(),
      numero: c.numero,
      contribuyenteId: c.contribuyenteId?.toString(),
      contribuyenteNombre: contrib?.nombre,
      contribuyenteRut: contrib?.rut,
      ejercicio: c.periodo?.ejercicio,
      estado: c.estado,
      semaforo: c.semaforo,
      confianzaGlobal: c.confianzaGlobal,
      fichaId: fichaMap.get(c._id.toString())?._id.toString(),
      fichaVersion: fichaMap.get(c._id.toString())?.version,
      aprobadaAt: fichaMap.get(c._id.toString())?.aprobadaAt?.toISOString(),
      canal: c.canal,
      documentoId: doc?._id.toString(),
      documentoNombre: doc?.nombreOriginal,
    };
  });
}

export async function repositorioRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/repositorio",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const query = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

      const { casoFilter, emptySearch } = await buildRepositorioQuery(query);
      if (emptySearch) {
        return { items: [], total: 0, page, limit };
      }

      const [casos, total] = await Promise.all([
        CasoModel.find(casoFilter)
          .sort({ "periodo.ejercicio": -1, updatedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        CasoModel.countDocuments(casoFilter),
      ]);

      return {
        items: await mapRepositorioItems(casos),
        total,
        page,
        limit,
      };
    }
  );

  app.get(
    "/repositorio/export.csv",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const { casoFilter, emptySearch } = await buildRepositorioQuery(query);

      const casos = emptySearch
        ? []
        : await CasoModel.find(casoFilter)
            .sort({ "periodo.ejercicio": -1, updatedAt: -1 })
            .limit(5000);

      const items = await mapRepositorioItems(casos);
      const header = [
        "numero",
        "contribuyente",
        "rut",
        "ejercicio",
        "estado",
        "semaforo",
        "fichaVersion",
        "canal",
        "aprobadaAt",
      ];
      const rows = items.map((r) =>
        [
          r.numero,
          r.contribuyenteNombre,
          r.contribuyenteRut,
          r.ejercicio,
          r.estado,
          r.semaforo,
          r.fichaVersion,
          r.canal,
          r.aprobadaAt,
        ]
          .map(csvEscape)
          .join(",")
      );

      const csv = [header.join(","), ...rows].join("\n");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="repositorio.csv"')
        .send("\uFEFF" + csv);
    }
  );
}
