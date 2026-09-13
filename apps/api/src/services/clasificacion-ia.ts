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
import { CONFIG_SISTEMA_ID, LineaEstado, type ClasificacionIaMasivaResultDto, type SugerenciaClasificacionIaDto } from "@ffa/shared";
import { Types } from "mongoose";

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
  linea.requiereRevision = sug.confianza < ctx.umbralConfianza;
  if (linea.estado !== LineaEstado.APROBADA) {
    linea.estado = LineaEstado.CLASIFICADA;
  }
}

export async function sugerirClasificacionLineaIa(
  casoId: string,
  lineaId: string,
  actorId: string
): Promise<SugerenciaClasificacionIaDto> {
  const linea = await LineaContableModel.findOne({ _id: lineaId, casoId });
  if (!linea) throw new Error("Línea no encontrada");

  const { ctx } = await loadCasoIaContext(casoId);

  return runWithIaContext(
    {
      actorTipo: "usuario",
      actorId,
      casoId,
      documentoId: linea.documentoId?.toString(),
    },
    async () => mapResult(await sugerirParaLinea(linea, casoId, ctx))
  );
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

export async function clasificarLineasDudosasIa(
  casoId: string,
  actorId: string
): Promise<ClasificacionIaMasivaResultDto> {
  const { caso, ctx } = await loadCasoIaContext(casoId);

  /** Solo líneas sin rubro — las que ya tienen rubro solo necesitan aprobación del analista. */
  const lineas = await LineaContableModel.find({
    casoId,
    requiereRevision: true,
    estado: { $ne: LineaEstado.APROBADA },
    $or: [{ rubroInstitucionalId: { $exists: false } }, { rubroInstitucionalId: null }],
  }).sort({ paginaNumero: 1, denominacionOriginal: 1 });

  const detalle: ClasificacionIaMasivaResultDto["detalle"] = [];
  let actualizadas = 0;
  let errores = 0;

  for (const linea of lineas) {
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
        lineaId: linea._id.toString(),
        denominacionOriginal: linea.denominacionOriginal,
        ok: true,
        rubroCodigo: sug.rubroCodigo,
        rubroNombre: sug.rubroNombre,
        confianza: sug.confianza,
        razonamiento: sug.razonamiento,
      });
    } catch (e) {
      errores++;
      detalle.push({
        lineaId: linea._id.toString(),
        denominacionOriginal: linea.denominacionOriginal,
        ok: false,
        error: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  if (actualizadas > 0) {
    caso.version = (caso.version ?? 0) + 1;
    await caso.save();
  }

  return {
    procesadas: lineas.length,
    actualizadas,
    errores,
    detalle,
  };
}

export function isClasificacionIaNoDisponible(err: unknown): err is ClasificacionIaNoDisponibleError {
  return err instanceof ClasificacionIaNoDisponibleError;
}
