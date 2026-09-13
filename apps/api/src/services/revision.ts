import {
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  CriterioAprobadoModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  FichaHistorialModel,
  LineaContableModel,
  RubroInstitucionalModel,
  ValidacionResultadoModel,
  AuditoriaEventoModel,
  type CasoDocument,
  type LineaContableDocument,
} from "@ffa/db";
import {
  calcularConfianzaGlobal,
  normalizarDenominacion,
  validateCase,
  type RubroRef,
} from "@ffa/pipeline";
import {
  CONFIG_SISTEMA_ID,
  CasoEstado,
  EstadoFinanciero,
  LineaEstado,
  ValidacionSeveridad,
  ValidacionTipo,
  isDemoExtractIdentity,
} from "@ffa/shared";
import { Types } from "mongoose";

export async function revalidarCaso(casoId: string): Promise<{
  semaforo: string;
  validacionesCount: number;
  confianzaGlobal: number;
}> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) {
    throw new Error("Caso sin plan de cuentas");
  }

  const rubrosDocs = await RubroInstitucionalModel.find({
    planCuentasVersionId: caso.planCuentasVersionId,
    activo: true,
  });
  const rubros: RubroRef[] = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
  }));

  const lineasDb = await LineaContableModel.find({
    casoId,
    estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
  });

  const classified = lineasDb.map((l) => ({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    paginaNumero: l.paginaNumero,
    denominacionNormalizada: l.denominacionNormalizada ?? l.denominacionOriginal,
    montoNormalizado: l.montoNormalizado ?? l.montoOriginal,
    signoAplicado: (l.signoAplicado ?? "positivo") as "positivo" | "negativo",
    rubroInstitucionalId: l.rubroInstitucionalId?.toString(),
    rubroCodigo: l.rubroCodigo ?? undefined,
    confianzaClasificacion: l.confianzaClasificacion ?? 0,
    requiereRevision: l.requiereRevision,
    origenClasificacion: l.origenClasificacion ?? undefined,
  }));

  const docFuente = await DocumentoFuenteModel.findOne({ casoId });
  const result = validateCase(classified, rubros, config?.umbralConfianza ?? 85, {
    escala: caso.escala ?? undefined,
    periodoEjercicio: caso.periodo?.ejercicio ?? undefined,
    tipoDocumento: docFuente?.tipoDocumento ?? undefined,
    añoVigente: new Date().getFullYear(),
  });

  const metaValidaciones = [...result.validaciones];
  if (docFuente?.extractMetadata && isDemoExtractIdentity(docFuente.extractMetadata)) {
    metaValidaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje:
        "Razón social/RUT de ejemplo detectados en la extracción — corregí los metadatos antes de aprobar",
      metadata: { origen: "sistema" },
    });
  }
  if (caso.contribuyenteId && docFuente?.extractMetadata) {
    const contrib = await ContribuyenteModel.findById(caso.contribuyenteId);
    const meta = docFuente.extractMetadata;
    const normRut = (r?: string | null) => (r ?? "").replace(/\./g, "").toUpperCase();
    if (contrib?.rut && meta.rut && normRut(contrib.rut) !== normRut(meta.rut)) {
      metaValidaciones.push({
        tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
        severidad: ValidacionSeveridad.WARNING,
        passed: false,
        mensaje: `RUT documento (${meta.rut}) ≠ contribuyente (${contrib.rut}) (D.12)`,
        metadata: { origen: "sistema" },
      });
    }
    if (
      contrib?.razonSocial &&
      meta.razonSocial &&
      !contrib.razonSocial.toLowerCase().includes(meta.razonSocial.toLowerCase().slice(0, 8)) &&
      !meta.razonSocial.toLowerCase().includes(contrib.razonSocial.toLowerCase().slice(0, 8))
    ) {
      metaValidaciones.push({
        tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
        severidad: ValidacionSeveridad.INFO,
        passed: false,
        mensaje: `Razón social documento difiere del contribuyente registrado (D.12)`,
        metadata: { origen: "sistema" },
      });
    }
  }

  const prevConfirmaciones = await ValidacionResultadoModel.find({
    casoId,
    confirmadaPorAnalista: { $in: [true, false] },
  });
  const confirmMap = new Map(
    prevConfirmaciones.map((v) => [`${v.tipo}|${v.mensaje}`, v.confirmadaPorAnalista as boolean])
  );

  await ValidacionResultadoModel.deleteMany({ casoId });
  await ValidacionResultadoModel.insertMany(
    metaValidaciones.map((v) => {
      const key = `${v.tipo}|${v.mensaje}`;
      const confirmada = confirmMap.get(key);
      return {
        casoId,
        tipo: v.tipo,
        severidad: v.severidad,
        passed: v.passed,
        mensaje: v.mensaje,
        metadata: v.metadata,
        at: new Date(),
        ...(confirmada !== undefined ? { confirmadaPorAnalista: confirmada } : {}),
      };
    })
  );

  const confianzaGlobal = calcularConfianzaGlobal(
    classified.map((l) => ({
      ...l,
      confianzaClasificacion: l.confianzaClasificacion ?? 0,
      requiereRevision: l.requiereRevision,
    }))
  );

  const hasMetaFail = metaValidaciones.some((v) => !v.passed && v.severidad !== "info");
  let semaforo = result.semaforo;
  if (hasMetaFail && semaforo === "verde") semaforo = "amarillo";

  caso.semaforo = semaforo;
  caso.confianzaGlobal = confianzaGlobal;
  await caso.save();

  return {
    semaforo,
    validacionesCount: metaValidaciones.length,
    confianzaGlobal,
  };
}

export async function recalcularConfianzaCaso(casoId: string): Promise<number> {
  const lineas = await LineaContableModel.find({
    casoId,
    estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
  });
  const confianza = calcularConfianzaGlobal(
    lineas.map((l) => ({
      denominacionOriginal: l.denominacionOriginal,
      montoOriginal: l.montoOriginal,
      paginaNumero: l.paginaNumero,
      denominacionNormalizada: l.denominacionNormalizada ?? l.denominacionOriginal,
      montoNormalizado: l.montoNormalizado ?? l.montoOriginal,
      signoAplicado: (l.signoAplicado ?? "positivo") as "positivo" | "negativo",
      confianzaClasificacion: l.confianzaClasificacion ?? 0,
      requiereRevision: l.requiereRevision,
    }))
  );
  await CasoModel.findByIdAndUpdate(casoId, { confianzaGlobal: confianza });
  return confianza;
}

export async function guardarCriterioDesdeLinea(
  linea: LineaContableDocument,
  caso: CasoDocument,
  userId: string
): Promise<void> {
  if (!caso.contribuyenteId || !linea.rubroInstitucionalId) return;
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  const existing = await CriterioAprobadoModel.findOne({
    contribuyenteId: caso.contribuyenteId,
    denominacionOrigen: denom,
  });
  const rubroChanged =
    existing &&
    existing.rubroInstitucionalId.toString() !== linea.rubroInstitucionalId.toString();

  await CriterioAprobadoModel.findOneAndUpdate(
    { contribuyenteId: caso.contribuyenteId, denominacionOrigen: denom },
    {
      contribuyenteId: caso.contribuyenteId,
      denominacionOrigen: denom,
      rubroInstitucionalId: linea.rubroInstitucionalId,
      aprobadoPor: new Types.ObjectId(userId),
      aprobadoAt: new Date(),
      casoOrigenId: caso._id,
      activo: true,
      version: rubroChanged ? (existing!.version ?? 1) + 1 : (existing?.version ?? 1),
    },
    { upsert: true, new: true }
  );
}

export async function generarFichaAprobada(
  caso: CasoDocument,
  userId: string,
  observaciones?: string
): Promise<string> {
  const lineas = await LineaContableModel.find({
    casoId: caso._id,
    estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
  });

  const rubrosDocs = await RubroInstitucionalModel.find({
    planCuentasVersionId: caso.planCuentasVersionId,
  });
  const rubroMap = new Map(rubrosDocs.map((r) => [r._id.toString(), r]));

  type DetalleEntry = {
    rubroId: Types.ObjectId;
    codigo: string;
    monto: number;
    lineasIds: Types.ObjectId[];
  };
  const balanceDetalle: DetalleEntry[] = [];
  const resultadosDetalle: DetalleEntry[] = [];

  for (const linea of lineas) {
    if (!linea.rubroInstitucionalId) continue;
    const rubro = rubroMap.get(linea.rubroInstitucionalId.toString());
    if (!rubro) continue;
    const entry: DetalleEntry = {
      rubroId: new Types.ObjectId(linea.rubroInstitucionalId.toString()),
      codigo: rubro.codigo,
      monto: linea.montoNormalizado ?? linea.montoOriginal,
      lineasIds: [new Types.ObjectId(linea._id.toString())],
    };
    if (rubro.estadoFinanciero === EstadoFinanciero.RESULTADOS) {
      resultadosDetalle.push(entry);
    } else {
      balanceDetalle.push(entry);
    }
  }

  const cuadraturaOkDb = await ValidacionResultadoModel.findOne({
    casoId: caso._id,
    tipo: "cuadratura",
    $or: [{ passed: true }, { confirmadaPorAnalista: true }],
  });

  const fichaPrev = await FichaCanonicaModel.findOne({ casoId: caso._id });
  if (fichaPrev) {
    await FichaHistorialModel.create({
      casoId: caso._id,
      version: fichaPrev.version ?? 1,
      estado: fichaPrev.estado,
      semaforo: fichaPrev.validacionesResumen?.semaforo ?? caso.semaforo,
      confianzaGlobal: caso.confianzaGlobal,
      aprobadaPor: fichaPrev.aprobadaPor,
      aprobadaAt: fichaPrev.aprobadaAt,
      observaciones: fichaPrev.observaciones,
    });
  }

  const ficha = await FichaCanonicaModel.findOneAndUpdate(
    { casoId: caso._id },
    {
      casoId: caso._id,
      contribuyenteId: caso.contribuyenteId,
      version: (caso.version ?? 0) + 1,
      estado: "aprobada",
      planCuentasVersionId: caso.planCuentasVersionId,
      balance: { detalle: balanceDetalle },
      estadoResultados: { detalle: resultadosDetalle },
      validacionesResumen: {
        cuadraturaOk: !!cuadraturaOkDb,
        semaforo: caso.semaforo,
        trazabilidadCompleta: true,
      },
      aprobadaPor: new Types.ObjectId(userId),
      aprobadaAt: new Date(),
      observaciones,
    },
    { upsert: true, new: true }
  );

  const fichaId = ficha._id.toString();

  const { enriquecerFichaTotales, calcularIndicadoresFicha } = await import(
    "./ficha-indicadores.js"
  );
  await enriquecerFichaTotales(fichaId);
  await calcularIndicadoresFicha(fichaId);

  return fichaId;
}

export function metadatosCasoCompletos(
  caso: Pick<CasoDocument, "moneda" | "escala" | "periodo">,
  extractMetadata?: { razonSocial?: string | null } | null
): boolean {
  return Boolean(
    caso.moneda?.trim() &&
      caso.periodo?.ejercicio != null &&
      caso.escala &&
      caso.escala !== "indeterminada" &&
      extractMetadata?.razonSocial?.trim()
  );
}

/** Confirmación explícita del analista (PATCH metadatos) posterior a la última re-extracción IA. */
export async function metadatosVerificadosPorAnalista(casoId: string): Promise<boolean> {
  const [ultConfirm, ultReextra] = await Promise.all([
    AuditoriaEventoModel.findOne({ casoId, accion: "metadatos_corregidos" })
      .sort({ at: -1 })
      .select("at"),
    AuditoriaEventoModel.findOne({ casoId, accion: "metadatos_reextraidos_ia" })
      .sort({ at: -1 })
      .select("at"),
  ]);
  if (!ultConfirm) return false;
  if (!ultReextra) return true;
  return ultConfirm.at.getTime() > ultReextra.at.getTime();
}

export async function assertFichaEditable(casoId: string): Promise<void> {
  const ficha = await FichaCanonicaModel.findOne({ casoId, estado: "aprobada" });
  if (ficha) {
    throw new Error(
      "La ficha está aprobada — use «Aprobar ficha» para generar una nueva versión auditada (K.15)"
    );
  }
}

export async function resolverPendientesRevision(
  casoId: string,
  userId: string
): Promise<{
  lineasAprobadas: number;
  lineasSinRubro: number;
  validacionesConfirmadas: number;
}> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const umbral = config?.umbralConfianza ?? 85;

  const pendientes = await LineaContableModel.find({
    casoId,
    requiereRevision: true,
    estado: { $ne: LineaEstado.APROBADA },
  });

  let lineasAprobadas = 0;
  let lineasSinRubro = 0;

  for (const linea of pendientes) {
    const rubroId = linea.rubroInstitucionalId ?? linea.clasificacionPropuesta;
    if (!rubroId) {
      lineasSinRubro++;
      continue;
    }
    linea.clasificacionFinal = rubroId;
    linea.confianzaClasificacion = Math.max(linea.confianzaClasificacion ?? umbral, umbral);
    linea.requiereRevision = false;
    linea.estado = LineaEstado.APROBADA;
    await linea.save();
    await guardarCriterioDesdeLinea(linea, caso, userId);
    lineasAprobadas++;
  }

  const validaciones = await ValidacionResultadoModel.find({
    casoId,
    passed: false,
    severidad: { $in: ["warning", "critical"] },
    $or: [{ confirmadaPorAnalista: { $exists: false } }, { confirmadaPorAnalista: null }],
  });

  let validacionesConfirmadas = 0;
  for (const val of validaciones) {
    val.confirmadaPorAnalista = true;
    await val.save();
    validacionesConfirmadas++;
  }

  if (lineasAprobadas > 0 || validacionesConfirmadas > 0) {
    caso.version = (caso.version ?? 0) + 1;
    await caso.save();
    await recalcularConfianzaCaso(casoId);
    if (lineasAprobadas > 0) {
      await revalidarCaso(casoId);
    }
    await confirmarValidacionesPendientesRevision(casoId);
  }

  return { lineasAprobadas, lineasSinRubro, validacionesConfirmadas };
}

async function confirmarValidacionesPendientesRevision(casoId: string): Promise<number> {
  const res = await ValidacionResultadoModel.updateMany(
    {
      casoId,
      passed: false,
      severidad: { $in: ["warning", "critical"] },
      $or: [{ confirmadaPorAnalista: { $exists: false } }, { confirmadaPorAnalista: null }],
    },
    { $set: { confirmadaPorAnalista: true } }
  );
  return res.modifiedCount ?? 0;
}

export function puedeAprobarFicha(
  casoId: string,
  opts?: { ignorarValidacionesPendientes?: boolean }
): Promise<{
  ok: boolean;
  motivos: string[];
}> {
  return (async () => {
    const motivos: string[] = [];
    const caso = await CasoModel.findById(casoId);
    if (!caso) {
      return { ok: false, motivos: ["Caso no encontrado"] };
    }

    const docFuente = await DocumentoFuenteModel.findOne({ casoId });
    if (!metadatosCasoCompletos(caso, docFuente?.extractMetadata)) {
      motivos.push(
        "Metadatos incompletos — completá empresa, moneda, ejercicio y escala en el paso 1"
      );
    }
    if (docFuente?.extractMetadata && isDemoExtractIdentity(docFuente.extractMetadata)) {
      motivos.push(
        "Razón social/RUT de ejemplo detectados — corregí los metadatos antes de aprobar"
      );
    }
    if (
      caso.estado === CasoEstado.EN_REVISION &&
      !(await metadatosVerificadosPorAnalista(casoId))
    ) {
      motivos.push("Metadatos no confirmados por el analista (paso 1 de revisión)");
    }

    const pendientes = await LineaContableModel.countDocuments({
      casoId,
      requiereRevision: true,
      estado: { $ne: LineaEstado.APROBADA },
    });
    if (pendientes > 0) {
      if (opts?.ignorarValidacionesPendientes) {
        const pendientesSinRubro = await LineaContableModel.countDocuments({
          casoId,
          requiereRevision: true,
          estado: { $ne: LineaEstado.APROBADA },
          $and: [
            {
              $or: [
                { rubroInstitucionalId: { $exists: false } },
                { rubroInstitucionalId: null },
              ],
            },
            {
              $or: [
                { clasificacionPropuesta: { $exists: false } },
                { clasificacionPropuesta: null },
              ],
            },
          ],
        });
        if (pendientesSinRubro > 0) {
          motivos.push(
            `${pendientesSinRubro} línea(s) pendientes sin rubro — asigná rubro antes de aprobar la ficha`
          );
        }
      } else {
        motivos.push(`${pendientes} línea(s) pendientes de revisión`);
      }
    }

    const sinConfirmar = opts?.ignorarValidacionesPendientes
      ? []
      : await ValidacionResultadoModel.find({
          casoId,
          passed: false,
          severidad: { $in: ["warning", "critical"] },
          $or: [{ confirmadaPorAnalista: { $exists: false } }, { confirmadaPorAnalista: null }],
        });
    for (const v of sinConfirmar) {
      if (v.tipo === "cuadratura") {
        motivos.push(
          `Cuadratura contable pendiente — corregí rubros/montos en Líneas o reconocé la alerta en Validaciones`
        );
      } else {
        motivos.push(`Validación pendiente (${v.tipo}): ${v.mensaje}`);
      }
    }

    const sinTrazabilidad = await LineaContableModel.countDocuments({
      casoId,
      estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
      $or: [
        { documentoId: { $exists: false } },
        { documentoId: null },
        { paginaNumero: { $exists: false } },
        { paginaNumero: null },
      ],
    });
    if (sinTrazabilidad > 0) {
      motivos.push(`${sinTrazabilidad} línea(s) sin trazabilidad documento/página (P.13)`);
    }

    const sinRubro = await LineaContableModel.countDocuments({
      casoId,
      estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
      $or: [{ rubroInstitucionalId: { $exists: false } }, { rubroInstitucionalId: null }],
    });
    if (sinRubro > 0) {
      motivos.push(`${sinRubro} línea(s) sin rubro institucional válido (X.2)`);
    }

    return { ok: motivos.length === 0, motivos };
  })();
}

export { CasoEstado };
