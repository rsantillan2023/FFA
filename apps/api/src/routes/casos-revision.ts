import {
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  FichaHistorialModel,
  LineaContableModel,
  RubroInstitucionalModel,
  registrarAuditoria,
  transicionarCaso,
  type LineaContableDocument,
} from "@ffa/db";
import { fechaPeriodoToDate, normalizarDenominacion } from "@ffa/pipeline";
import {
  CONFIG_SISTEMA_ID,
  CasoEstado,
  LineaEstado,
  type FichaCanonicaDto,
  type LineaContableDto,
  type RubroOptionDto,
  type ClasificacionIaMasivaResultDto,
  type ClasificacionIaProgresoDto,
  type EliminarDuplicadosLineasResultDto,
  type SugerenciaClasificacionIaDto,
  type BalanceAnalisisDto,
  type ReconciliarBalanceResultDto,
} from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDocumentoBuffer } from "../lib/storage.js";
import { authenticate } from "../plugins/auth.js";
import { edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";
import { resolveIdentidadParaCaso } from "../services/caso-identidad.js";
import { obtenerExtraccionIaTexto } from "../services/extraccion-ia-texto.js";
import { reextraerMetadatosCaso } from "../services/reextraer-metadatos.js";
import {
  aplicarClasificacionIaLinea,
  clasificarLineasDudosasIa,
  isClasificacionIaNoDisponible,
  sugerirClasificacionLineaIa,
} from "../services/clasificacion-ia.js";
import { obtenerClasificacionIaProgreso } from "../services/clasificacion-ia-progreso.js";
import {
  eliminarLineasDuplicadas,
  generarFichaAprobada,
  guardarCriterioDesdeLinea,
  puedeAprobarFicha,
  recalcularConfianzaCaso,
  resolverPendientesRevision,
  revalidarCaso,
} from "../services/revision.js";
import { analizarBalanceCaso, reconciliarBalanceCaso } from "../services/balance-reconciliar.js";

async function mapLinea(doc: LineaContableDocument): Promise<LineaContableDto> {
  let rubroNombre: string | undefined;
  if (doc.rubroInstitucionalId) {
    const rubro = await RubroInstitucionalModel.findById(doc.rubroInstitucionalId).select("nombre");
    rubroNombre = rubro?.nombre;
  }
  const bbox = doc.bbox;
  const candidatos = doc.candidatosAsistidos?.map((c) => ({
    rubroInstitucionalId: c.rubroInstitucionalId?.toString() ?? "",
    codigo: c.codigo ?? "",
    nombre: c.nombre ?? "",
    score: c.score ?? 0,
  }));

  return {
    id: doc._id.toString(),
    casoId: doc.casoId.toString(),
    documentoId: doc.documentoId.toString(),
    paginaNumero: doc.paginaNumero,
    denominacionOriginal: doc.denominacionOriginal,
    denominacionNormalizada: doc.denominacionNormalizada ?? undefined,
    montoOriginal: doc.montoOriginal,
    montoNormalizado: doc.montoNormalizado ?? undefined,
    rubroCodigo: doc.rubroCodigo ?? undefined,
    rubroNombre,
    rubroInstitucionalId: doc.rubroInstitucionalId?.toString(),
    confianzaExtraccion: doc.confianzaExtraccion ?? undefined,
    confianzaClasificacion: doc.confianzaClasificacion ?? undefined,
    requiereRevision: doc.requiereRevision,
    origenClasificacion: doc.origenClasificacion ?? undefined,
    clasificacionIaAt: doc.clasificacionIaAt?.toISOString?.() ?? undefined,
    clasificacionIaRazonamiento: doc.clasificacionIaRazonamiento ?? undefined,
    candidatosAsistidos: candidatos?.length ? candidatos : undefined,
    estado: doc.estado,
    bbox:
      bbox?.x != null && bbox?.y != null && bbox?.w != null && bbox?.h != null
        ? { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }
        : undefined,
    excluirDeCuadratura: doc.excluirDeCuadratura ?? undefined,
    motivoExclusionCuadratura: doc.motivoExclusionCuadratura ?? undefined,
  };
}

const deleteLineaSchema = z.object({
  eliminarSimilares: z.boolean().optional(),
});

const patchLineaSchema = z.object({
  version: z.number().int().optional(),
  denominacionOriginal: z.string().min(1).optional(),
  montoNormalizado: z.number().optional(),
  rubroInstitucionalId: z.string().optional(),
  motivo: z.string().min(1).max(500).optional(),
});

const reclasificarMasivaSchema = z.object({
  lineaOrigenId: z.string(),
  rubroInstitucionalId: z.string(),
  motivo: z.string().min(1).max(500).optional(),
});

const manualLineaSchema = z.object({
  documentoId: z.string(),
  denominacionOriginal: z.string().min(1),
  montoNormalizado: z.number(),
  rubroInstitucionalId: z.string(),
  paginaNumero: z.number().int().min(1).optional(),
});

const aprobarFichaSchema = z.object({
  version: z.number().int(),
  observaciones: z.string().optional(),
  ignorarValidacionesPendientes: z.boolean().optional(),
  cierreParcial: z.boolean().optional(),
  motivoCierreParcial: z.string().optional(),
});

const patchMetadatosSchema = z.object({
  moneda: z.string().optional(),
  escala: z.enum(["unidades", "miles", "millones", "indeterminada"]).optional(),
  ejercicio: z.number().int().optional(),
  periodoDesde: z.string().optional(),
  periodoHasta: z.string().optional(),
  razonSocial: z.string().optional(),
  rut: z.string().optional(),
});

export async function casosRevisionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/casos/:id/extraccion-ia",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id).select("_id");
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      try {
        return await obtenerExtraccionIaTexto(id);
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo obtener la extracción",
        });
      }
    }
  );

  app.post(
    "/casos/:id/reextraer-metadatos",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await reextraerMetadatosCaso(id, request.user.id);
        const identidadResuelta = await resolveIdentidadParaCaso(
          (await CasoModel.findById(id))!
        );
        return { ...result, identidadResuelta };
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudieron re-leer los metadatos",
        });
      }
    }
  );

  app.patch(
    "/casos/:id/metadatos",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchMetadatosSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      if (parsed.data.moneda) caso.moneda = parsed.data.moneda;
      if (parsed.data.escala) caso.escala = parsed.data.escala;
      if (parsed.data.ejercicio != null) {
        caso.periodo = caso.periodo ?? {};
        caso.periodo.ejercicio = parsed.data.ejercicio;
      }
      if (parsed.data.periodoDesde) {
        const desde = fechaPeriodoToDate(parsed.data.periodoDesde);
        if (desde) {
          caso.periodo = caso.periodo ?? {};
          caso.periodo.desde = desde;
        }
      }
      if (parsed.data.periodoHasta) {
        const hasta = fechaPeriodoToDate(parsed.data.periodoHasta);
        if (hasta) {
          caso.periodo = caso.periodo ?? {};
          caso.periodo.hasta = hasta;
        }
      }
      await caso.save();

      const doc = await DocumentoFuenteModel.findOne({ casoId: id });
      if (doc) {
        doc.extractMetadata = doc.extractMetadata ?? {};
        if (parsed.data.moneda) doc.extractMetadata.moneda = parsed.data.moneda;
        if (parsed.data.escala) doc.extractMetadata.escala = parsed.data.escala;
        if (parsed.data.ejercicio != null) {
          doc.extractMetadata.periodo = doc.extractMetadata.periodo ?? {};
          doc.extractMetadata.periodo.ejercicio = parsed.data.ejercicio;
        }
        if (parsed.data.razonSocial) doc.extractMetadata.razonSocial = parsed.data.razonSocial;
        if (parsed.data.rut) doc.extractMetadata.rut = parsed.data.rut;
        await doc.save();
      }

      if (caso.contribuyenteId && (parsed.data.razonSocial || parsed.data.rut)) {
        const contrib = await ContribuyenteModel.findById(caso.contribuyenteId);
        if (contrib) {
          if (parsed.data.razonSocial?.trim()) contrib.razonSocial = parsed.data.razonSocial.trim();
          if (parsed.data.rut?.trim()) contrib.rut = parsed.data.rut.trim();
          await contrib.save();
        }
      }

      await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "metadatos_corregidos",
        payload: parsed.data as Record<string, unknown>,
      });

      const identidadResuelta = await resolveIdentidadParaCaso(caso);

      return {
        moneda: caso.moneda,
        escala: caso.escala,
        periodo: caso.periodo,
        extractMetadata: doc?.extractMetadata,
        identidadResuelta,
      };
    }
  );

  app.get(
    "/casos/:id/rubros",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply): Promise<RubroOptionDto[]> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const planId = caso.planCuentasVersionId;
      if (!planId) return [];

      const rubros = await RubroInstitucionalModel.find({
        planCuentasVersionId: planId,
        activo: true,
      }).sort({ orden: 1 });

      const refs = rubros.map((r) => ({
        id: r._id.toString(),
        codigo: r.codigo,
        nombre: r.nombre,
        estadoFinanciero: r.estadoFinanciero,
        convencionSigno: (r.convencionSigno ?? "normal") as "normal" | "invertido",
        padreId: r.padreId?.toString(),
      }));

      const { filtrarRubrosAsignables } = await import("@ffa/pipeline");
      const asignables = filtrarRubrosAsignables(refs);
      const idsAsignables = new Set(asignables.map((r) => r.id));

      const lineas = await LineaContableModel.find({ casoId: id })
        .select("rubroInstitucionalId rubroCodigo")
        .lean();
      const idsIncluidos = new Set(idsAsignables);
      for (const l of lineas) {
        if (l.rubroInstitucionalId) idsIncluidos.add(l.rubroInstitucionalId.toString());
        if (l.rubroCodigo) {
          const porCodigo = refs.find((r) => r.codigo === l.rubroCodigo);
          if (porCodigo) idsIncluidos.add(porCodigo.id);
        }
      }

      return refs
        .filter((r) => idsIncluidos.has(r.id))
        .map(({ padreId: _p, ...r }) => ({
          ...r,
          asignable: idsAsignables.has(r.id),
        }));
    }
  );

  app.get(
    "/casos/:id/documentos/:docId/file",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id, docId } = request.params as { id: string; docId: string };
      const doc = await DocumentoFuenteModel.findOne({ _id: docId, casoId: id });
      if (!doc) return reply.code(404).send({ error: "Documento no encontrado" });

      const { buffer, contentType } = await getDocumentoBuffer(doc.storageKey);
      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "documento_fuente",
        entidadId: docId,
        accion: "documento_consultado",
      });

      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `inline; filename="${doc.nombreOriginal}"`)
        .send(buffer);
    }
  );

  app.get(
    "/casos/:id/documentos/:docId/derivados/:nombre",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id, docId, nombre } = request.params as {
        id: string;
        docId: string;
        nombre: string;
      };
      if (!/^[\w.-]+\.(png|jpe?g|webp)$/i.test(nombre)) {
        return reply.code(400).send({ error: "Nombre de derivado inválido" });
      }

      const doc = await DocumentoFuenteModel.findOne({ _id: docId, casoId: id });
      if (!doc) return reply.code(404).send({ error: "Documento no encontrado" });

      const keys = [
        ...(doc.derivados?.paginasNormalizadas ?? []),
        ...(doc.derivados?.miniaturaKey ? [doc.derivados.miniaturaKey] : []),
      ];
      const storageKey = keys.find((k) => k.endsWith(`/${nombre}`) || k.endsWith(`\\${nombre}`) || k.endsWith(nombre));
      if (!storageKey) {
        return reply.code(404).send({ error: "Derivado no encontrado" });
      }

      const { buffer, contentType } = await getDocumentoBuffer(storageKey);
      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "documento_fuente",
        entidadId: docId,
        accion: "documento_derivado_consultado",
        payload: { nombre },
      });

      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `inline; filename="${nombre}"`)
        .send(buffer);
    }
  );

  app.patch(
    "/casos/:id/lineas/:lid",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id, lid } = request.params as { id: string; lid: string };
      const parsed = patchLineaSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      if (parsed.data.version != null && caso.version !== parsed.data.version) {
        return reply.code(409).send({ error: "El caso fue modificado por otro usuario" });
      }

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const linea = await LineaContableModel.findOne({ _id: lid, casoId: id });
      if (!linea) return reply.code(404).send({ error: "Línea no encontrada" });

      const antes = {
        denominacion: linea.denominacionOriginal,
        monto: linea.montoNormalizado,
        rubro: linea.rubroCodigo,
      };

      if (parsed.data.denominacionOriginal) {
        linea.denominacionOriginal = parsed.data.denominacionOriginal;
        linea.denominacionNormalizada = normalizarDenominacion(parsed.data.denominacionOriginal);
      }
      if (parsed.data.montoNormalizado != null) {
        linea.montoNormalizado = parsed.data.montoNormalizado;
      }
      const rubroCambiado = Boolean(parsed.data.rubroInstitucionalId);
      if (parsed.data.rubroInstitucionalId) {
        const rubro = await RubroInstitucionalModel.findById(parsed.data.rubroInstitucionalId);
        if (!rubro) return reply.code(400).send({ error: "Rubro inválido" });
        if (
          caso.planCuentasVersionId &&
          rubro.planCuentasVersionId.toString() !== caso.planCuentasVersionId.toString()
        ) {
          return reply.code(400).send({ error: "Rubro fuera del plan de cuentas del caso" });
        }
        linea.set("rubroInstitucionalId", rubro._id);
        linea.rubroCodigo = rubro.codigo;
        linea.set("clasificacionFinal", rubro._id);
        linea.origenClasificacion = "manual";
        linea.set("clasificacionIaAt", undefined);
        linea.clasificacionIaRazonamiento = undefined;
      }

      linea.confianzaClasificacion = 100;
      linea.requiereRevision = false;
      linea.estado = LineaEstado.APROBADA;
      await linea.save();

      caso.version = (caso.version ?? 0) + 1;
      await caso.save();

      await guardarCriterioDesdeLinea(linea, caso, request.user.id);
      await recalcularConfianzaCaso(id);
      const reval = await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "linea_contable",
        entidadId: lid,
        accion: rubroCambiado ? "linea_reclasificada" : "linea_corregida",
        payload: {
          antes,
          despues: parsed.data,
          motivo: parsed.data.motivo ?? null,
          revalidacion: reval,
        },
      });

      return mapLinea(linea);
    }
  );

  app.get(
    "/casos/:id/balance/analisis",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply): Promise<BalanceAnalisisDto | { error: string }> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      try {
        const query = request.query as { paginas?: string; ia?: string };
        const paginasObjetivo = query.paginas
          ? query.paginas.split(",").map((p) => parseInt(p.trim(), 10)).filter((n) => n > 0)
          : undefined;
        const diagnosticoIa = query.ia === "1" || query.ia === "true";
        return await analizarBalanceCaso(id, paginasObjetivo, { diagnosticoIa });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo analizar el balance";
        return reply.code(400).send({ error: msg });
      }
    }
  );

  app.post(
    "/casos/:id/balance/reconciliar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply): Promise<ReconciliarBalanceResultDto | { error: string }> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ficha no editable";
        return reply.code(409).send({ error: msg });
      }
      const body = (request.body ?? {}) as { paginasObjetivo?: number[]; crearAjuste?: boolean };
      try {
        const result = await reconciliarBalanceCaso(id, {
          paginasObjetivo: body.paginasObjetivo,
          crearAjuste: body.crearAjuste,
        });
        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "caso",
          entidadId: id,
          accion: "balance_reconciliado",
          payload: {
            accionesAplicadas: result.accionesAplicadas,
            cuadraturaOk: result.analisis.totales.cuadraturaOk,
            diferencia: result.analisis.totales.diferencia,
          },
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo reconciliar el balance";
        return reply.code(400).send({ error: msg });
      }
    }
  );

  app.post(
    "/casos/:id/lineas/eliminar-duplicados",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply): Promise<EliminarDuplicadosLineasResultDto | { error: string }> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        return await eliminarLineasDuplicadas(id, request.user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudieron eliminar duplicados";
        const code = msg.includes("aprobada") ? 409 : 400;
        return reply.code(code).send({ error: msg });
      }
    }
  );

  app.delete(
    "/casos/:id/lineas/:lid",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id, lid } = request.params as { id: string; lid: string };
      const parsed = deleteLineaSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const linea = await LineaContableModel.findOne({ _id: lid, casoId: id });
      if (!linea) return reply.code(404).send({ error: "Línea no encontrada" });

      const denomNorm =
        linea.denominacionNormalizada ?? normalizarDenominacion(linea.denominacionOriginal);
      const montoRef = linea.montoNormalizado ?? linea.montoOriginal;

      let idsEliminar = [lid];
      if (parsed.data.eliminarSimilares) {
        const similares = await LineaContableModel.find({
          casoId: id,
          denominacionNormalizada: denomNorm,
          $or: [{ montoNormalizado: montoRef }, { montoOriginal: montoRef }],
        }).select("_id");
        idsEliminar = similares.map((s) => s._id.toString());
      }

      const res = await LineaContableModel.deleteMany({
        _id: { $in: idsEliminar },
        casoId: id,
      });

      caso.version = (caso.version ?? 0) + 1;
      await caso.save();

      await recalcularConfianzaCaso(id);
      await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "linea_contable",
        entidadId: lid,
        accion: parsed.data.eliminarSimilares ? "lineas_eliminadas_masiva" : "linea_eliminada",
        payload: {
          eliminadas: res.deletedCount ?? idsEliminar.length,
          lineaIds: idsEliminar,
          denominacionOriginal: linea.denominacionOriginal,
          denominacionNormalizada: denomNorm,
          monto: montoRef,
        },
      });

      return { eliminadas: res.deletedCount ?? idsEliminar.length };
    }
  );

  app.post(
    "/casos/:id/lineas/:lid/sugerir-ia",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply): Promise<SugerenciaClasificacionIaDto> => {
      const { id, lid } = request.params as { id: string; lid: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const linea = await LineaContableModel.findOne({ _id: lid, casoId: id });
      if (!linea) return reply.code(404).send({ error: "Línea no encontrada" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      try {
        const sugerencia = await sugerirClasificacionLineaIa(id, lid, request.user.id, { persistir: true });
        await recalcularConfianzaCaso(id);
        await revalidarCaso(id);

        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "linea_contable",
          entidadId: lid,
          accion: "linea_clasificada_ia",
          payload: {
            denominacion: linea.denominacionOriginal,
            rubroCodigo: sugerencia.rubroCodigo,
            confianza: sugerencia.confianza,
            proveedor: sugerencia.proveedor,
            persistida: true,
          },
        });
        return sugerencia;
      } catch (e) {
        if (isClasificacionIaNoDisponible(e)) {
          return reply.code(503).send({
            error: "Clasificación con IA no disponible — configure OPENAI_API_KEY o ANTHROPIC_API_KEY",
            codigo: "ia_no_disponible",
          });
        }
        const msg = e instanceof Error ? e.message : "Error al solicitar sugerencia IA";
        return reply.code(502).send({ error: msg });
      }
    }
  );

  app.post(
    "/casos/:id/lineas/:lid/aplicar-ia",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id, lid } = request.params as { id: string; lid: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const lineaAntes = await LineaContableModel.findOne({ _id: lid, casoId: id });
      if (!lineaAntes) return reply.code(404).send({ error: "Línea no encontrada" });

      try {
        const linea = await aplicarClasificacionIaLinea(id, lid, request.user.id);
        await recalcularConfianzaCaso(id);
        await revalidarCaso(id);

        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "linea_contable",
          entidadId: lid,
          accion: "linea_clasificada_ia",
          payload: {
            denominacion: linea.denominacionOriginal,
            rubroAnterior: lineaAntes.rubroCodigo ?? null,
            rubroCodigo: linea.rubroCodigo,
            confianza: linea.confianzaClasificacion,
          },
        });

        return mapLinea(linea);
      } catch (e) {
        if (isClasificacionIaNoDisponible(e)) {
          return reply.code(503).send({
            error: "Clasificación con IA no disponible — configure OPENAI_API_KEY o ANTHROPIC_API_KEY",
            codigo: "ia_no_disponible",
          });
        }
        const msg = e instanceof Error ? e.message : "Error al aplicar clasificación IA";
        return reply.code(502).send({ error: msg });
      }
    }
  );

  app.get(
    "/casos/:id/lineas/clasificacion-ia/progreso",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply): Promise<ClasificacionIaProgresoDto> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      return obtenerClasificacionIaProgreso(id);
    }
  );

  app.post(
    "/casos/:id/lineas/clasificar-ia-dudosas",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply): Promise<ClasificacionIaMasivaResultDto> => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      try {
        const resultado = await clasificarLineasDudosasIa(id, request.user.id);
        if (resultado.actualizadas > 0) {
          await recalcularConfianzaCaso(id);
          await revalidarCaso(id);
        }

        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "lineas_contables",
          accion: "lineas_clasificadas_ia_masiva",
          payload: {
            procesadas: resultado.procesadas,
            actualizadas: resultado.actualizadas,
            errores: resultado.errores,
          },
        });

        return resultado;
      } catch (e) {
        if (isClasificacionIaNoDisponible(e)) {
          return reply.code(503).send({
            error: "Clasificación con IA no disponible — configure OPENAI_API_KEY o ANTHROPIC_API_KEY",
            codigo: "ia_no_disponible",
          });
        }
        const msg = e instanceof Error ? e.message : "Error en clasificación masiva IA";
        return reply.code(502).send({ error: msg });
      }
    }
  );

  app.post(
    "/casos/:id/lineas/:lid/aprobar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id, lid } = request.params as { id: string; lid: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const linea = await LineaContableModel.findOne({ _id: lid, casoId: id });
      if (!linea) return reply.code(404).send({ error: "Línea no encontrada" });

      const rubroId = linea.rubroInstitucionalId ?? linea.clasificacionPropuesta;
      if (!rubroId) {
        return reply.code(400).send({ error: "Línea sin rubro institucional — asigne rubro antes de aprobar (X.2)" });
      }

      const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
      const umbral = config?.umbralConfianza ?? 85;

      linea.clasificacionFinal = rubroId;
      linea.confianzaClasificacion = Math.max(linea.confianzaClasificacion ?? umbral, umbral);
      linea.requiereRevision = false;
      linea.estado = LineaEstado.APROBADA;
      await linea.save();

      await guardarCriterioDesdeLinea(linea, caso, request.user.id);
      await recalcularConfianzaCaso(id);
      await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "linea_contable",
        entidadId: lid,
        accion: "linea_aprobada",
      });

      return mapLinea(linea);
    }
  );

  app.post(
    "/casos/:id/lineas/reclasificar-masiva",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = reclasificarMasivaSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const origen = await LineaContableModel.findOne({
        _id: parsed.data.lineaOrigenId,
        casoId: id,
      });
      if (!origen) return reply.code(404).send({ error: "Línea origen no encontrada" });

      const rubro = await RubroInstitucionalModel.findById(parsed.data.rubroInstitucionalId);
      if (!rubro) return reply.code(400).send({ error: "Rubro inválido" });
      if (
        caso.planCuentasVersionId &&
        rubro.planCuentasVersionId.toString() !== caso.planCuentasVersionId.toString()
      ) {
        return reply.code(400).send({ error: "Rubro fuera del plan de cuentas del caso" });
      }

      const denomNorm =
        origen.denominacionNormalizada ?? normalizarDenominacion(origen.denominacionOriginal);
      const similares = await LineaContableModel.find({
        casoId: id,
        denominacionNormalizada: denomNorm,
      });

      let actualizadas = 0;
      for (const linea of similares) {
        linea.set("rubroInstitucionalId", rubro._id);
        linea.rubroCodigo = rubro.codigo;
        linea.set("clasificacionFinal", rubro._id);
        linea.origenClasificacion = "manual";
        linea.confianzaClasificacion = 100;
        linea.requiereRevision = false;
        linea.estado = LineaEstado.APROBADA;
        await linea.save();
        await guardarCriterioDesdeLinea(linea, caso, request.user.id);
        actualizadas++;
      }

      caso.version = (caso.version ?? 0) + 1;
      await caso.save();
      await recalcularConfianzaCaso(id);
      await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "lineas_contables",
        accion: "linea_reclasificada_masiva",
        payload: {
          lineaOrigenId: parsed.data.lineaOrigenId,
          rubroInstitucionalId: parsed.data.rubroInstitucionalId,
          motivo: parsed.data.motivo ?? null,
          actualizadas,
          denominacionNormalizada: denomNorm,
        },
      });

      return { actualizadas };
    }
  );

  app.post(
    "/casos/:id/lineas/manual",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = manualLineaSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const doc = await DocumentoFuenteModel.findOne({
        _id: parsed.data.documentoId,
        casoId: id,
      });
      if (!doc) return reply.code(400).send({ error: "Documento no pertenece al caso" });

      const rubro = await RubroInstitucionalModel.findById(parsed.data.rubroInstitucionalId);
      if (!rubro) return reply.code(400).send({ error: "Rubro inválido" });
      if (
        caso.planCuentasVersionId &&
        rubro.planCuentasVersionId.toString() !== caso.planCuentasVersionId.toString()
      ) {
        return reply.code(400).send({ error: "Rubro fuera del plan de cuentas del caso" });
      }

      const linea = await LineaContableModel.create({
        casoId: id,
        documentoId: parsed.data.documentoId,
        paginaNumero: parsed.data.paginaNumero ?? 1,
        denominacionOriginal: parsed.data.denominacionOriginal,
        denominacionNormalizada: normalizarDenominacion(parsed.data.denominacionOriginal),
        montoOriginal: parsed.data.montoNormalizado,
        montoNormalizado: parsed.data.montoNormalizado,
        rubroInstitucionalId: rubro._id,
        rubroCodigo: rubro.codigo,
        clasificacionFinal: rubro._id,
        confianzaExtraccion: 100,
        confianzaClasificacion: 100,
        requiereRevision: false,
        origenClasificacion: "manual",
        estado: LineaEstado.APROBADA,
      });

      caso.version = (caso.version ?? 0) + 1;
      await caso.save();

      await recalcularConfianzaCaso(id);
      await revalidarCaso(id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "linea_contable",
        entidadId: linea._id.toString(),
        accion: "linea_manual_creada",
      });

      return reply.code(201).send(await mapLinea(linea));
    }
  );

  app.get(
    "/casos/:id/puede-aprobar-ficha",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      const q = request.query as { ignorarValidacionesPendientes?: string };
      return puedeAprobarFicha(id, {
        ignorarValidacionesPendientes: q.ignorarValidacionesPendientes === "true",
      });
    }
  );

  app.post(
    "/casos/:id/resolver-pendientes-revision",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      try {
        const { assertFichaEditable } = await import("../services/revision.js");
        await assertFichaEditable(id);
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "Ficha aprobada no editable",
        });
      }

      const resultado = await resolverPendientesRevision(id, request.user.id);

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        accion: "pendientes_resueltos_aprobacion_forzada",
        payload: resultado,
      });

      return resultado;
    }
  );

  app.post(
    "/casos/:id/aprobar-ficha",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = aprobarFichaSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      if (caso.estado !== CasoEstado.EN_REVISION && caso.estado !== CasoEstado.APROBADO) {
        return reply.code(400).send({ error: "El caso no está en revisión" });
      }
      if (caso.version !== parsed.data.version) {
        return reply.code(409).send({ error: "El caso fue modificado — recargue e intente de nuevo" });
      }

      const forzarPendientes =
        parsed.data.ignorarValidacionesPendientes === true || parsed.data.cierreParcial === true;
      const cierreParcial = parsed.data.cierreParcial === true;
      if (cierreParcial && !parsed.data.motivoCierreParcial?.trim()) {
        return reply.code(400).send({ error: "Indicá el motivo del cierre con observaciones" });
      }
      if (forzarPendientes) {
        await resolverPendientesRevision(id, request.user.id);
      }

      const check = await puedeAprobarFicha(id, {
        ignorarValidacionesPendientes: forzarPendientes,
      });
      if (!check.ok) {
        return reply.code(400).send({ error: check.motivos.join("; ") });
      }

      const obsBase = parsed.data.observaciones?.trim() ?? "";
      const obsFinal = cierreParcial
        ? [obsBase, `[Cierre parcial] ${parsed.data.motivoCierreParcial!.trim()}`]
            .filter(Boolean)
            .join("\n\n")
        : obsBase || undefined;

      const fichaId = await generarFichaAprobada(caso, request.user.id, obsFinal, {
        cierreParcial,
        motivoCierreParcial: parsed.data.motivoCierreParcial?.trim(),
      });
      caso.observaciones = obsFinal ?? caso.observaciones;
      caso.version = (caso.version ?? 0) + 1;
      await caso.save();

      await transicionarCaso(id, CasoEstado.APROBADO, {
        by: request.user.id,
        nota: cierreParcial ? "Ficha cerrada con observaciones (cierre parcial)" : "Ficha aprobada por analista",
      });

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "ficha_canonica",
        entidadId: fichaId,
        accion: cierreParcial ? "ficha_cierre_parcial" : "ficha_aprobada",
        payload: {
          observaciones: obsFinal,
          cierreParcial,
          motivoCierreParcial: parsed.data.motivoCierreParcial?.trim(),
        },
      });

      const ficha = await FichaCanonicaModel.findById(fichaId);
      const dto: FichaCanonicaDto = {
        id: fichaId,
        casoId: id,
        estado: ficha!.estado,
        version: ficha!.version,
        validacionesResumen: ficha!.validacionesResumen
          ? {
              cuadraturaOk: ficha!.validacionesResumen.cuadraturaOk ?? undefined,
              semaforo: ficha!.validacionesResumen.semaforo ?? undefined,
            }
          : undefined,
        aprobadaAt: ficha!.aprobadaAt?.toISOString(),
        observaciones: ficha!.observaciones ?? undefined,
        cierreParcial: ficha!.cierreParcial ?? undefined,
        motivoCierreParcial: ficha!.motivoCierreParcial ?? undefined,
      };
      return reply.code(201).send(dto);
    }
  );

  app.get(
    "/casos/:id/fichas/historial",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      const rows = await FichaHistorialModel.find({ casoId: id }).sort({ version: -1 });
      return rows.map((h) => ({
        id: h._id.toString(),
        casoId: id,
        version: h.version,
        estado: h.estado,
        semaforo: h.semaforo ?? undefined,
        confianzaGlobal: h.confianzaGlobal ?? undefined,
        aprobadaAt: h.aprobadaAt?.toISOString(),
        observaciones: h.observaciones ?? undefined,
      }));
    }
  );

  app.get(
    "/casos/:id/ficha",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply): Promise<FichaCanonicaDto | { error: string }> => {
      const { id } = request.params as { id: string };
      const ficha = await FichaCanonicaModel.findOne({ casoId: id });
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });
      return {
        id: ficha._id.toString(),
        casoId: id,
        estado: ficha.estado,
        version: ficha.version,
        validacionesResumen: ficha.validacionesResumen
          ? {
              cuadraturaOk: ficha.validacionesResumen.cuadraturaOk ?? undefined,
              semaforo: ficha.validacionesResumen.semaforo ?? undefined,
            }
          : undefined,
        aprobadaAt: ficha.aprobadaAt?.toISOString(),
        observaciones: ficha.observaciones ?? undefined,
        cierreParcial: ficha.cierreParcial ?? undefined,
        motivoCierreParcial: ficha.motivoCierreParcial ?? undefined,
      };
    }
  );
}
