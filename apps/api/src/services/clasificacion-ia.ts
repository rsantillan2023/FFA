import {
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  LineaContableModel,
  RubroInstitucionalModel,
  type LineaContableDocument,
} from "@ffa/db";
import {
  ClasificacionIaNoDisponibleError,
  runWithIaContext,
  sugerirClasificacionIa,
  type RubroRef,
  type SugerenciaClasificacionIaResult,
} from "@ffa/pipeline";
import {
  CONFIG_SISTEMA_ID,
  LineaEstado,
  type ClasificacionIaLote,
  type ClasificacionIaMasivaResultDto,
  type SugerenciaClasificacionIaDto,
} from "@ffa/shared";
import { Types } from "mongoose";
import {
  actualizarClasificacionIaProgreso,
  clasificacionIaEnCurso,
  finalizarClasificacionIaProgreso,
  iniciarClasificacionIaProgreso,
  registrarEventoLineaClasificacionIa,
} from "./clasificacion-ia-progreso.js";

function mapResult(result: SugerenciaClasificacionIaResult): SugerenciaClasificacionIaDto {
  return {
    rubroInstitucionalId: result.rubroInstitucionalId,
    rubroCodigo: result.rubroCodigo,
    rubroNombre: result.rubroNombre,
    confianza: result.confianza,
    razonamiento: result.razonamiento,
    proveedor: result.proveedor,
    modelo: result.modelo,
  };
}

type CasoIaContext = {
  rubros: RubroRef[];
  rubrosById: Map<string, RubroRef>;
  moneda?: string;
  escala?: string;
  razonSocial?: string;
  umbralConfianza: number;
};

async function loadCasoIaContext(casoId: string) {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const planId = caso.planCuentasVersionId;
  if (!planId) throw new Error("El caso no tiene plan de cuentas asociado");

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const [rubrosDocs, contrib] = await Promise.all([
    RubroInstitucionalModel.find({ planCuentasVersionId: planId, activo: true }).sort({ orden: 1 }),
    caso.contribuyenteId ? ContribuyenteModel.findById(caso.contribuyenteId) : null,
  ]);

  const rubros: RubroRef[] = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
    corriente: r.corriente ?? undefined,
    padreId: r.padreId?.toString(),
    aliases: r.aliases?.length ? [...r.aliases] : undefined,
  }));

  return {
    caso,
    ctx: {
      rubros,
      rubrosById: new Map(rubros.map((r) => [r.id, r])),
      moneda: caso.moneda ?? undefined,
      escala: caso.escala ?? undefined,
      razonSocial: contrib?.razonSocial ?? undefined,
      umbralConfianza: config?.umbralConfianza ?? 85,
    },
  };
}

async function sugerirParaLinea(
  linea: LineaContableDocument,
  casoId: string,
  ctx: CasoIaContext
): Promise<SugerenciaClasificacionIaResult> {
  const lineasPagina = await LineaContableModel.find({
    casoId,
    paginaNumero: linea.paginaNumero,
    _id: { $ne: linea._id },
  })
    .select("denominacionOriginal")
    .limit(8);

  const candidatosHeuristicos = linea.candidatosAsistidos?.map((c) => ({
    codigo: c.codigo ?? "",
    nombre: c.nombre ?? "",
    score: c.score ?? 0,
  }));

  return sugerirClasificacionIa({
    denominacionOriginal: linea.denominacionOriginal,
    montoNormalizado: linea.montoNormalizado ?? linea.montoOriginal,
    paginaNumero: linea.paginaNumero,
    codigoOrigen: linea.codigoOrigen ?? undefined,
    columnaOrigen: linea.columnaOrigen ?? undefined,
    rubroActualId: linea.rubroInstitucionalId?.toString(),
    rubroActualCodigo: linea.rubroCodigo ?? undefined,
    candidatosHeuristicos: candidatosHeuristicos?.length ? candidatosHeuristicos : undefined,
    rubros: ctx.rubros,
    contextoCaso: {
      moneda: ctx.moneda,
      escala: ctx.escala,
      razonSocial: ctx.razonSocial,
      lineasMismaPagina: lineasPagina.map((l) => l.denominacionOriginal),
    },
  });
}

function aplicarSugerenciaEnLinea(
  linea: LineaContableDocument,
  sug: SugerenciaClasificacionIaResult,
  ctx: CasoIaContext
): void {
  const rubro = ctx.rubrosById.get(sug.rubroInstitucionalId);
  if (!rubro) throw new Error("Rubro sugerido no encontrado en el plan");

  linea.rubroInstitucionalId = new Types.ObjectId(sug.rubroInstitucionalId);
  linea.clasificacionPropuesta = new Types.ObjectId(sug.rubroInstitucionalId);
  linea.rubroCodigo = rubro.codigo;
  linea.confianzaClasificacion = sug.confianza;
  linea.origenClasificacion = "ia_revision";
  linea.clasificacionIaAt = new Date();
  linea.clasificacionIaRazonamiento = sug.razonamiento;
  // Decisión IA firme: la línea pasa a OK (verde). El analista puede corregir manualmente después.
  linea.requiereRevision = false;
  if (linea.estado !== LineaEstado.APROBADA) {
    linea.estado = LineaEstado.CLASIFICADA;
  }
}

/** Línea ya procesada por IA en revisión — no volver a enviar al modelo salvo reclasificación total. */
export function lineaYaClasificadaPorIaRevision(linea: {
  clasificacionIaAt?: Date | null;
  origenClasificacion?: string | null;
}): boolean {
  return Boolean(linea.clasificacionIaAt) || linea.origenClasificacion === "ia_revision";
}

export async function sugerirClasificacionLineaIa(
  casoId: string,
  lineaId: string,
  actorId: string,
  opts?: { persistir?: boolean }
): Promise<SugerenciaClasificacionIaDto> {
  const linea = await LineaContableModel.findOne({ _id: lineaId, casoId });
  if (!linea) throw new Error("Línea no encontrada");

  const { ctx } = await loadCasoIaContext(casoId);

  const sug = await runWithIaContext(
    {
      actorTipo: "usuario",
      actorId,
      casoId,
      documentoId: linea.documentoId?.toString(),
    },
    async () => sugerirParaLinea(linea, casoId, ctx)
  );

  if (opts?.persistir !== false) {
    aplicarSugerenciaEnLinea(linea, sug, ctx);
    await linea.save();
  }

  return mapResult(sug);
}

export async function aplicarClasificacionIaLinea(
  casoId: string,
  lineaId: string,
  actorId: string
): Promise<LineaContableDocument> {
  const linea = await LineaContableModel.findOne({ _id: lineaId, casoId });
  if (!linea) throw new Error("Línea no encontrada");

  const { ctx } = await loadCasoIaContext(casoId);

  const sug = await runWithIaContext(
    {
      actorTipo: "usuario",
      actorId,
      casoId,
      documentoId: linea.documentoId?.toString(),
    },
    async () => sugerirParaLinea(linea, casoId, ctx)
  );

  aplicarSugerenciaEnLinea(linea, sug, ctx);
  await linea.save();
  return linea;
}

function filtroLineasDudosasIa(casoId: string, umbralConfianza: number) {
  return {
    casoId,
    requiereRevision: true,
    estado: { $ne: LineaEstado.APROBADA },
    clasificacionIaAt: { $exists: false },
    origenClasificacion: { $ne: "ia_revision" },
    $or: [
      { rubroInstitucionalId: { $exists: false } },
      { rubroInstitucionalId: null },
      {
        rubroInstitucionalId: { $exists: true, $ne: null },
        confianzaClasificacion: { $lt: umbralConfianza },
      },
    ],
  };
}

/** Cuenta líneas pendientes que ya tienen clasificación IA persistida (omitidas en re-ejecución). */
export async function contarLineasOmitidasClasificacionIa(
  casoId: string,
  umbralConfianza: number
): Promise<number> {
  return LineaContableModel.countDocuments({
    casoId,
    requiereRevision: true,
    estado: { $ne: LineaEstado.APROBADA },
    $or: [{ clasificacionIaAt: { $exists: true, $ne: null } }, { origenClasificacion: "ia_revision" }],
    $and: [
      {
        $or: [
          { rubroInstitucionalId: { $exists: false } },
          { rubroInstitucionalId: null },
          {
            rubroInstitucionalId: { $exists: true, $ne: null },
            confianzaClasificacion: { $lt: umbralConfianza },
          },
        ],
      },
    ],
  });
}

function loteLineaDudosa(linea: LineaContableDocument): ClasificacionIaLote {
  return linea.rubroInstitucionalId ? "baja_confianza" : "sin_rubro";
}

function mensajeLote(lote: ClasificacionIaLote): string {
  return lote === "sin_rubro" ? "Sin rubro" : "Baja confianza";
}

export async function clasificarLineasDudosasIa(
  casoId: string,
  actorId: string
): Promise<ClasificacionIaMasivaResultDto> {
  if (clasificacionIaEnCurso(casoId)) {
    throw new Error("Ya hay una clasificación con IA en curso para este caso");
  }

  const { caso, ctx } = await loadCasoIaContext(casoId);

  const omitidas = await contarLineasOmitidasClasificacionIa(casoId, ctx.umbralConfianza);

  const todas = await LineaContableModel.find(filtroLineasDudosasIa(casoId, ctx.umbralConfianza)).sort({
    paginaNumero: 1,
    denominacionOriginal: 1,
  });

  const sinRubro = todas.filter((l) => loteLineaDudosa(l) === "sin_rubro");
  const bajaConfianza = todas.filter((l) => loteLineaDudosa(l) === "baja_confianza");
  const lotes = [
    { lote: "sin_rubro" as ClasificacionIaLote, lineas: sinRubro },
    { lote: "baja_confianza" as ClasificacionIaLote, lineas: bajaConfianza },
  ].filter((g) => g.lineas.length > 0);

  const total = todas.length;
  const detalle: ClasificacionIaMasivaResultDto["detalle"] = [];
  let actualizadas = 0;
  let errores = 0;
  let procesadas = 0;

  if (total === 0) {
    return {
      procesadas: 0,
      actualizadas: 0,
      errores: 0,
      omitidas,
      detalle: [],
    };
  }

  iniciarClasificacionIaProgreso(casoId, {
    total,
    loteSinRubro: sinRubro.length,
    loteBajaConfianza: bajaConfianza.length,
  });

  try {
    for (const grupo of lotes) {
      for (let i = 0; i < grupo.lineas.length; i++) {
        const linea = grupo.lineas[i];
        const lineaId = linea._id.toString();
        registrarEventoLineaClasificacionIa(casoId, {
          lineaId,
          denominacionOriginal: linea.denominacionOriginal,
          estado: "procesando",
        });
        actualizarClasificacionIaProgreso(casoId, {
          lote: grupo.lote,
          loteActual: grupo.lote === "sin_rubro" ? 1 : 2,
          loteTotalLineas: grupo.lineas.length,
          loteProcesadas: i + 1,
          lineaId,
          denominacionOriginal: linea.denominacionOriginal,
          procesadas,
          actualizadas,
          errores,
          mensaje: `Procesando — ${linea.denominacionOriginal}`,
        });

        try {
          const sug = await runWithIaContext(
            {
              actorTipo: "usuario",
              actorId,
              casoId,
              documentoId: linea.documentoId?.toString(),
            },
            async () => sugerirParaLinea(linea, casoId, ctx)
          );

          aplicarSugerenciaEnLinea(linea, sug, ctx);
          await linea.save();

          actualizadas++;
          detalle.push({
            lineaId,
            denominacionOriginal: linea.denominacionOriginal,
            ok: true,
            rubroCodigo: sug.rubroCodigo,
            rubroNombre: sug.rubroNombre,
            confianza: sug.confianza,
            razonamiento: sug.razonamiento,
          });
          registrarEventoLineaClasificacionIa(casoId, {
            lineaId,
            denominacionOriginal: linea.denominacionOriginal,
            estado: "ok",
            rubroCodigo: sug.rubroCodigo,
            rubroNombre: sug.rubroNombre,
            confianza: sug.confianza,
          });
        } catch (e) {
          errores++;
          const errMsg = e instanceof Error ? e.message : "Error desconocido";
          detalle.push({
            lineaId,
            denominacionOriginal: linea.denominacionOriginal,
            ok: false,
            error: errMsg,
          });
          registrarEventoLineaClasificacionIa(casoId, {
            lineaId,
            denominacionOriginal: linea.denominacionOriginal,
            estado: "error",
            error: errMsg,
          });
        }

        procesadas++;
        actualizarClasificacionIaProgreso(casoId, {
          procesadas,
          actualizadas,
          errores,
          loteProcesadas: i + 1,
          mensaje: `${mensajeLote(grupo.lote)} — ${i + 1}/${grupo.lineas.length} (${procesadas}/${total})`,
        });
      }
    }

    if (actualizadas > 0) {
      caso.version = (caso.version ?? 0) + 1;
      await caso.save();
    }

    const resultado: ClasificacionIaMasivaResultDto = {
      procesadas: total,
      actualizadas,
      errores,
      omitidas,
      detalle,
    };
    finalizarClasificacionIaProgreso(casoId, resultado);
    return resultado;
  } catch (e) {
    const resultado: ClasificacionIaMasivaResultDto = {
      procesadas: procesadas,
      actualizadas,
      errores: errores + 1,
      omitidas,
      detalle,
    };
    finalizarClasificacionIaProgreso(
      casoId,
      resultado,
      e instanceof Error ? e.message : "Error en clasificación masiva IA"
    );
    throw e;
  }
}

export function isClasificacionIaNoDisponible(err: unknown): err is ClasificacionIaNoDisponibleError {
  return err instanceof ClasificacionIaNoDisponibleError;
}
