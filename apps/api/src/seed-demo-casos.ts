import {
  AuditoriaEventoModel,
  CasoModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  FichaHistorialModel,
  IndicadorCalculadoModel,
  InformeComiteModel,
  LineaContableModel,
  UserModel,
  ValidacionResultadoModel,
} from "@ffa/db";
import type { ExtractResult } from "@ffa/pipeline";
import {
  CanalRecepcion,
  CasoEstado,
  LineaEstado,
  UserRole,
  ValidacionSeveridad,
  ValidacionTipo,
} from "@ffa/shared";
import { sha256, uploadDocumento, uploadInformeDocx, uploadInformeHtml } from "@ffa/storage";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Types } from "mongoose";
import { calcularIndicadoresFicha, enriquecerFichaTotales } from "./services/ficha-indicadores.js";
import { buildInformeDocx } from "./services/informe-docx.js";
import { buildDemoApartados, buildInformeHtml } from "./services/informe-render.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pipelineFixtures = resolve(rootDir, "packages/pipeline/fixtures");
const demoConfigPath = resolve(rootDir, "fixtures/demo-casos.json");
const DEMO_SEED_MARKER = "FFA-2026-DEMO-30";
const DEMO_SEED_VERSION = "v2-30";

/** PDF mínimo válido para vista en revisión (sin dependencias externas). */
const DEMO_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj
4 0 obj<</Length 80>>stream
BT /F1 14 Tf 72 720 Td (Estados financieros auditados - ejercicio 2025) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000276 00000 n 
0000000404 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
484
%%EOF`,
  "utf-8"
);

const DENOM_RUBRO: Record<string, string> = {
  "caja y bancos": "1.2.01",
  "efectivo y equivalentes": "1.2.01",
  "cash and cash equivalents": "1.2.01",
  "intangible assets": "1.1.01",
  "propiedades planta equipo": "1.1.02",
  "propiedad planta y equipo": "1.1.02",
  "property, plant and equipment": "1.1.02",
  "right-of-use assets": "1.1.03",
  "investments in associates and joint ventures": "1.1.04",
  "inventories": "1.2.05",
  "trade receivables": "1.2.03",
  "other receivables": "1.2.04",
  "investments in financial assets": "1.2.02",
  "deferred income tax assets, net": "1.1.07",
  "cuentas por pagar": "2.2.09",
  "cuentas por pagar comerciales": "2.2.09",
  "accounts payable": "2.2.09",
  "deuda largo plazo": "2.1.08",
  "deuda financiera no corriente": "2.1.08",
  "loans": "2.2.07",
  "lease liabilities": "2.2.06",
  "provisions": "2.2.01",
  "salaries and social security": "2.2.05",
  "capital pagado": "3.1",
  "capital emitido": "3.1",
  "shareholders' contributions": "3.1",
  "retiros socios": "3.5",
  "utilidades retenidas": "3.2",
  "retained earnings": "3.2",
  "non-controlling interest": "3.4",
  "ingresos operacionales": "4.1",
  "ingresos de actividades ordinarias": "4.1",
  "revenues": "4.1",
  "costos operacionales": "4.2",
  "costo de ventas": "4.2",
  "costs": "4.2",
  "gastos administración": "4.4",
  "administrative expenses": "4.4",
  "exploration expenses": "4.5",
  "impairment of property, plant and equipment and intangible assets": "4.6",
  "net financial results": "4.10",
  "income tax": "4.11",
  "utilidad del ejercicio": "4.12",
  "resultado del periodo": "4.12",
  "net profit or loss for the year": "4.12",
  "total activo": "1",
  "total pasivo": "2",
  "total patrimonio": "3",
  "total shareholders' equity": "3",
};

interface DemoConfig {
  seedVersion?: string;
  contribuyentes: Array<{
    rut: string;
    razonSocial: string;
    denominacionesAlternativas?: string[];
  }>;
  casos: Array<{
    numero: string;
    contribuyenteRut: string;
    estado: string;
    semaforo: "verde" | "amarillo" | "rojo";
    confianzaGlobal: number;
    documento: string;
    fixture: string;
    lineasRevision: string[];
    conFichaAprobada?: boolean;
    conInformeFinal?: boolean;
    conInformePreliminar?: boolean;
    sinLineas?: boolean;
    sinAsignar?: boolean;
    canal?: "portal" | "correo" | "manual_alternativa";
    calidadOrigen?: "nativo" | "escaneado_legible" | "degradado" | "ilegible" | "pendiente";
    ejercicio?: number;
    observaciones: string;
  }>;
}

function loadFixture(name: string): ExtractResult {
  const raw = readFileSync(resolve(pipelineFixtures, name), "utf-8");
  return JSON.parse(raw) as ExtractResult;
}

function rubroForDenom(denom: string, rubrosByCodigo: Map<string, string>): string | undefined {
  const key = denom.trim().toLowerCase();
  const codigo = DENOM_RUBRO[key];
  return codigo ? rubrosByCodigo.get(codigo) : undefined;
}

const HISTORIAL_CHAINS: Partial<Record<CasoEstado, CasoEstado[]>> = {
  [CasoEstado.RECIBIDO]: [CasoEstado.RECIBIDO],
  [CasoEstado.EN_COLA]: [CasoEstado.RECIBIDO, CasoEstado.EN_COLA],
  [CasoEstado.PREPROCESANDO]: [CasoEstado.RECIBIDO, CasoEstado.EN_COLA, CasoEstado.PREPROCESANDO],
  [CasoEstado.EXTRAYENDO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
  ],
  [CasoEstado.NORMALIZANDO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
  ],
  [CasoEstado.CLASIFICANDO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
  ],
  [CasoEstado.VALIDANDO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
  ],
  [CasoEstado.EN_REVISION]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
    CasoEstado.EN_REVISION,
  ],
  [CasoEstado.APROBADO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
    CasoEstado.EN_REVISION,
    CasoEstado.APROBADO,
  ],
  [CasoEstado.INFORME_GENERADO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
    CasoEstado.EN_REVISION,
    CasoEstado.APROBADO,
    CasoEstado.INFORME_GENERADO,
  ],
  [CasoEstado.PENDIENTE_CALIDAD]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.PENDIENTE_CALIDAD,
  ],
  [CasoEstado.ERROR]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.ERROR,
  ],
  [CasoEstado.RECHAZADO]: [
    CasoEstado.RECIBIDO,
    CasoEstado.EN_COLA,
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
    CasoEstado.EN_REVISION,
    CasoEstado.RECHAZADO,
  ],
  [CasoEstado.CANCELADO]: [CasoEstado.RECIBIDO, CasoEstado.EN_COLA, CasoEstado.CANCELADO],
};

const HISTORIAL_NOTAS: Partial<Record<CasoEstado, string>> = {
  [CasoEstado.EN_COLA]: "Encolado para preprocesamiento",
  [CasoEstado.PREPROCESANDO]: "Preprocesamiento de documento iniciado",
  [CasoEstado.EXTRAYENDO]: "Extracción de líneas contables completada",
  [CasoEstado.NORMALIZANDO]: "Montos y metadatos normalizados",
  [CasoEstado.CLASIFICANDO]: "Rubros asignados según plan de cuentas vigente",
  [CasoEstado.VALIDANDO]: "Validaciones de cuadratura y coherencia ejecutadas",
  [CasoEstado.EN_REVISION]: "Derivado a cola de revisión analítica",
  [CasoEstado.APROBADO]: "Ficha aprobada por analista",
  [CasoEstado.INFORME_GENERADO]: "Informe de comité generado",
  [CasoEstado.PENDIENTE_CALIDAD]: "Calidad del documento requiere verificación manual",
  [CasoEstado.ERROR]: "Procesamiento interrumpido por error de extracción",
  [CasoEstado.RECHAZADO]: "Caso rechazado tras revisión analítica",
  [CasoEstado.CANCELADO]: "Caso cancelado por el analista",
};

function notaHistorialEstado(estado: CasoEstado, canal: CanalRecepcion): string {
  if (estado === CasoEstado.RECIBIDO) {
    if (canal === CanalRecepcion.CORREO) return "Documento recibido por correo electrónico";
    if (canal === CanalRecepcion.MANUAL_ALTERNATIVA) return "Carga manual alternativa iniciada";
    return "Documento cargado vía portal institucional";
  }
  return HISTORIAL_NOTAS[estado] ?? "Actualización de estado registrada";
}

function buildHistorial(
  estadoFinal: CasoEstado,
  adminId: Types.ObjectId,
  at: Date,
  canal: CanalRecepcion
): Array<{ estado: CasoEstado; at: Date; by?: Types.ObjectId; nota?: string }> {
  const steps = HISTORIAL_CHAINS[estadoFinal] ?? [estadoFinal];
  return steps.map((estado, i) => ({
    estado,
    at: new Date(at.getTime() + i * 60_000),
    by: adminId,
    nota: notaHistorialEstado(estado, canal),
  }));
}

function remitenteDocumento(canal: CanalRecepcion, razonSocial?: string): string {
  const slug =
    (razonSocial ?? "empresa")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 22) || "empresa";
  if (canal === CanalRecepcion.MANUAL_ALTERNATIVA) return "carga.manual@ecr-salud.local";
  return `contabilidad@${slug}.cl`;
}

function mensajeCuadratura(semaforo: "verde" | "amarillo" | "rojo"): string {
  if (semaforo === "verde") return "Activo = Pasivo + Patrimonio verificado";
  return "Diferencia menor en totales — revisar líneas marcadas";
}

function mensajeCoherencia(semaforo: "verde" | "amarillo" | "rojo"): string {
  if (semaforo === "rojo") {
    return "Inconsistencias detectadas entre balance y estado de resultados";
  }
  return "Balance y estado de resultados coherentes";
}

const DOC_PREPROCESS_LOG = {
  etapa: "preprocess",
  mensaje: "Formato PDF validado · páginas indexadas",
};

const DOC_NORMALIZE_LOG = {
  etapa: "normalize",
  mensaje: "Montos expresados en miles CLP según metadatos del documento",
};

function procesamientoForEstado(estado: CasoEstado): { etapaActual: string; progresoPct: number } {
  const map: Partial<Record<CasoEstado, { etapaActual: string; progresoPct: number }>> = {
    [CasoEstado.RECIBIDO]: { etapaActual: "receive", progresoPct: 5 },
    [CasoEstado.EN_COLA]: { etapaActual: "queue", progresoPct: 10 },
    [CasoEstado.PREPROCESANDO]: { etapaActual: "preprocess", progresoPct: 25 },
    [CasoEstado.EXTRAYENDO]: { etapaActual: "extract", progresoPct: 40 },
    [CasoEstado.NORMALIZANDO]: { etapaActual: "normalize", progresoPct: 55 },
    [CasoEstado.CLASIFICANDO]: { etapaActual: "classify", progresoPct: 70 },
    [CasoEstado.VALIDANDO]: { etapaActual: "validate", progresoPct: 85 },
    [CasoEstado.PENDIENTE_CALIDAD]: { etapaActual: "preprocess", progresoPct: 15 },
    [CasoEstado.ERROR]: { etapaActual: "extract", progresoPct: 35 },
  };
  return map[estado] ?? { etapaActual: "validate", progresoPct: 100 };
}

function resolveCanal(canal?: DemoConfig["casos"][number]["canal"]): CanalRecepcion {
  if (canal === "correo") return CanalRecepcion.CORREO;
  if (canal === "manual_alternativa") return CanalRecepcion.MANUAL_ALTERNATIVA;
  return CanalRecepcion.PORTAL;
}

async function ensureAnalista(): Promise<string> {
  const email = "analista@ecr-salud.local";
  const passwordHash = await bcrypt.hash("Analista123!", 12);
  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      email,
      passwordHash,
      nombre: "Carolina Ríos",
      rol: UserRole.ANALISTA,
      activo: true,
    },
    { upsert: true, new: true }
  );
  return user._id.toString();
}

async function clearDemoCasos(): Promise<number> {
  const casos = await CasoModel.find({ numero: /^FFA-2026-DEMO-/ }).select("_id");
  if (casos.length === 0) return 0;

  const casoIds = casos.map((c) => c._id);
  const fichas = await FichaCanonicaModel.find({ casoId: { $in: casoIds } }).select("_id");
  const fichaIds = fichas.map((f) => f._id);

  if (fichaIds.length > 0) {
    await IndicadorCalculadoModel.deleteMany({ fichaId: { $in: fichaIds } });
  }
  await InformeComiteModel.deleteMany({ casoId: { $in: casoIds } });
  await FichaHistorialModel.deleteMany({ casoId: { $in: casoIds } });
  await FichaCanonicaModel.deleteMany({ casoId: { $in: casoIds } });
  await LineaContableModel.deleteMany({ casoId: { $in: casoIds } });
  await ValidacionResultadoModel.deleteMany({ casoId: { $in: casoIds } });
  await DocumentoFuenteModel.deleteMany({ casoId: { $in: casoIds } });
  await AuditoriaEventoModel.deleteMany({ casoId: { $in: casoIds } });
  await CasoModel.deleteMany({ _id: { $in: casoIds } });

  return casos.length;
}

export async function seedDemoCasos(input: {
  adminId: string;
  planVersionId: string;
  reglasVersionId: string;
  indicadoresVersionId: string;
  plantillaVersionId: string;
  rubrosByCodigo: Map<string, string>;
  umbral: number;
}): Promise<void> {
  const config = JSON.parse(readFileSync(demoConfigPath, "utf-8")) as DemoConfig;
  const markerExists = await CasoModel.exists({ numero: DEMO_SEED_MARKER });
  if (markerExists) {
    console.log(`  Demo casos: seed ${DEMO_SEED_VERSION} ya aplicado (${DEMO_SEED_MARKER}) — omitido`);
    return;
  }

  const oldCount = await CasoModel.countDocuments({ numero: /^FFA-2026-DEMO-/ });
  if (oldCount > 0) {
    const removed = await clearDemoCasos();
    console.log(`  Demo casos: eliminados ${removed} casos demo previos (upgrade a ${DEMO_SEED_VERSION})`);
  }

  const analistaId = await ensureAnalista();
  const adminOid = new Types.ObjectId(input.adminId);
  const analistaOid = new Types.ObjectId(analistaId);
  const now = new Date();

  const contribIds = new Map<string, string>();
  for (const c of config.contribuyentes) {
    const doc = await ContribuyenteModel.findOneAndUpdate(
      { rut: c.rut },
      {
        rut: c.rut,
        razonSocial: c.razonSocial,
        denominacionesAlternativas: c.denominacionesAlternativas ?? [],
      },
      { upsert: true, new: true }
    );
    contribIds.set(c.rut, doc._id.toString());
  }

  const resumen: Record<string, number> = {};

  for (const demo of config.casos) {
    const extract = loadFixture(demo.fixture);
    const meta = extract.metadata ?? {};
    const contribuyenteId = contribIds.get(demo.contribuyenteRut)!;
    const estadoFinal = demo.estado as CasoEstado;
    const ejercicio = demo.ejercicio ?? meta.periodo?.ejercicio ?? 2025;
    const canal = resolveCanal(demo.canal);
    const proc = procesamientoForEstado(estadoFinal);

    resumen[estadoFinal] = (resumen[estadoFinal] ?? 0) + 1;

    const caso = await CasoModel.create({
      numero: demo.numero,
      contribuyenteId,
      canal,
      estado: estadoFinal,
      estadoHistorial: buildHistorial(estadoFinal, adminOid, now, canal),
      periodo: {
        ejercicio,
        desde: demo.ejercicio
          ? new Date(`${ejercicio}-01-01`)
          : meta.periodo?.desde
            ? new Date(meta.periodo.desde)
            : new Date(`${ejercicio}-01-01`),
        hasta: demo.ejercicio
          ? new Date(`${ejercicio}-12-31`)
          : meta.periodo?.hasta
            ? new Date(meta.periodo.hasta)
            : new Date(`${ejercicio}-12-31`),
      },
      moneda: meta.moneda ?? "CLP",
      escala: meta.escala ?? "miles",
      semaforo: demo.semaforo,
      confianzaGlobal: demo.confianzaGlobal,
      umbralAplicado: input.umbral,
      planCuentasVersionId: input.planVersionId,
      reglasVersionId: input.reglasVersionId,
      asignadoA: demo.sinAsignar ? undefined : analistaOid,
      observaciones: demo.observaciones,
      elegibleAutoAprobacion:
        estadoFinal === CasoEstado.EN_REVISION &&
        demo.semaforo === "verde" &&
        demo.lineasRevision.length === 0,
      enColaAt: new Date(now.getTime() - 3600_000),
    });

    const casoId = caso._id.toString();
    const docBuffer = DEMO_PDF;
    const documento = await DocumentoFuenteModel.create({
      casoId: caso._id,
      nombreOriginal: demo.documento,
      mimeType: "application/pdf",
      storageKey: await uploadDocumento(casoId, "seed-doc", demo.documento, docBuffer, "application/pdf"),
      hashSha256: sha256(docBuffer),
      canal,
      recepcion: {
        at: new Date(now.getTime() - 7200_000),
        remitente: remitenteDocumento(canal, meta.razonSocial),
        usuarioId: adminOid,
      },
      calidadOrigen: demo.calidadOrigen ?? "nativo",
      paginaCount: 2,
      tipoDocumento:
        extract.tipoDocumento === "ifrs"
          ? "ifrs"
          : extract.tipoDocumento === "estado_resultados"
            ? "estado_resultados"
            : "balance_clasificado",
      procesamiento: { etapaActual: proc.etapaActual, progresoPct: proc.progresoPct },
      extractMetadata: {
        razonSocial: meta.razonSocial,
        rut: meta.rut,
        moneda: meta.moneda,
        escala: meta.escala,
        periodo: meta.periodo,
      },
      preprocessLog: [{ ...DOC_PREPROCESS_LOG }],
      normalizeLog: demo.sinLineas ? [] : [{ ...DOC_NORMALIZE_LOG }],
    });

    const revisionSet = new Set(demo.lineasRevision.map((s) => s.toLowerCase()));
    const lineasIds: unknown[] = [];
    const balanceDetalle: Array<Record<string, unknown>> = [];
    const erDetalle: Array<Record<string, unknown>> = [];

    if (!demo.sinLineas) {
      for (const [idx, linea] of (extract.lineas ?? []).entries()) {
        if (/^total /i.test(linea.denominacionOriginal)) continue;

        const rubroId = rubroForDenom(linea.denominacionOriginal, input.rubrosByCodigo);
        const rubroCodigo = rubroId
          ? [...input.rubrosByCodigo.entries()].find(([, id]) => id === rubroId)?.[0]
          : undefined;
        const confExt = linea.confianzaExtraccion ?? 90;
        const confCls = rubroId ? Math.min(98, confExt + 4) : 40;
        const needsReview =
          revisionSet.has(linea.denominacionOriginal.toLowerCase()) ||
          confCls < input.umbral ||
          !rubroId;

        const montoNorm = linea.montoOriginal ?? 0;
        const approved = Boolean(demo.conFichaAprobada && !needsReview && rubroId);

        const lineaDoc = await LineaContableModel.create({
          casoId: caso._id,
          documentoId: documento._id,
          paginaNumero: linea.paginaNumero ?? 1,
          bbox: { x: 0.08, y: 0.12 + idx * 0.04, w: 0.84, h: 0.035 },
          lineaEnPagina: idx + 1,
          codigoOrigen: linea.codigoOrigen,
          denominacionOriginal: linea.denominacionOriginal,
          denominacionNormalizada: linea.denominacionOriginal,
          columnaOrigen: linea.columnaOrigen ?? "saldo",
          montoOriginal: linea.montoOriginal ?? 0,
          montoNormalizado: montoNorm,
          signoAplicado: "positivo",
          rubroInstitucionalId: rubroId ? new Types.ObjectId(rubroId) : undefined,
          rubroCodigo,
          clasificacionPropuesta: rubroId ? new Types.ObjectId(rubroId) : undefined,
          clasificacionFinal: rubroId ? new Types.ObjectId(rubroId) : undefined,
          confianzaExtraccion: confExt,
          confianzaClasificacion: confCls,
          requiereRevision: needsReview,
          origenClasificacion: rubroId ? "regla" : undefined,
          estado: approved ? LineaEstado.APROBADA : LineaEstado.CLASIFICADA,
        });
        lineasIds.push(lineaDoc._id);

        if (rubroId && rubroCodigo && approved) {
          const entry = {
            rubroId: new Types.ObjectId(rubroId),
            codigo: rubroCodigo,
            monto: montoNorm,
            lineasIds: [lineaDoc._id],
          };
          if (rubroCodigo.startsWith("4.")) {
            erDetalle.push(entry);
          } else if (!rubroCodigo.startsWith("T")) {
            balanceDetalle.push(entry);
          }
        }
      }

      await ValidacionResultadoModel.create([
        {
          casoId: caso._id,
          tipo: ValidacionTipo.CUADRATURA,
          severidad: demo.semaforo === "rojo" ? ValidacionSeveridad.CRITICAL : ValidacionSeveridad.INFO,
          passed: demo.semaforo !== "rojo",
          mensaje: mensajeCuadratura(demo.semaforo),
          confirmadaPorAnalista: demo.conFichaAprobada ? true : undefined,
        },
        {
          casoId: caso._id,
          tipo: ValidacionTipo.COHERENCIA_ESTADOS,
          severidad: ValidacionSeveridad.INFO,
          passed: demo.semaforo !== "rojo",
          mensaje: mensajeCoherencia(demo.semaforo),
        },
      ]);
    }

    await AuditoriaEventoModel.create({
      actorTipo: "sistema",
      casoId: caso._id,
      entidad: "Caso",
      entidadId: caso._id,
      accion: "seed_demo_pipeline",
      payload: { fixture: demo.fixture, lineas: lineasIds.length, seedVersion: DEMO_SEED_VERSION },
    });

    if (demo.conFichaAprobada) {
      const ficha = await FichaCanonicaModel.create({
        casoId: caso._id,
        contribuyenteId: new Types.ObjectId(contribuyenteId),
        version: 1,
        estado: "aprobada",
        planCuentasVersionId: new Types.ObjectId(input.planVersionId),
        balance: { detalle: balanceDetalle },
        estadoResultados: { detalle: erDetalle },
        validacionesResumen: {
          cuadraturaOk: demo.semaforo !== "rojo",
          semaforo: demo.semaforo,
          trazabilidadCompleta: true,
        },
        aprobadaPor: analistaOid,
        aprobadaAt: new Date(),
        observaciones: "Revisión analítica completada sin observaciones adicionales",
      });

      await enriquecerFichaTotales(ficha._id.toString());
      await calcularIndicadoresFicha(ficha._id.toString());

      const indicadoresDemo = await IndicadorCalculadoModel.find({ fichaId: ficha._id });
      const razonSocial = meta.razonSocial ?? demo.contribuyenteRut;
      const apartadosDemo = buildDemoApartados({
        razonSocial,
        numeroCaso: demo.numero,
        semaforo: demo.semaforo,
        confianza: demo.confianzaGlobal,
        indicadores: indicadoresDemo,
        final: Boolean(demo.conInformeFinal),
      });

      if (demo.conInformeFinal) {
        const informeHtml = await buildInformeHtml(ficha._id.toString(), {
          estadoInforme: "Final",
          apartadoAnalisis: apartadosDemo.analisis,
          apartadoRecomendacion: apartadosDemo.recomendacion,
        });
        const htmlKey = await uploadInformeHtml(
          casoId,
          ficha._id.toString(),
          Buffer.from(informeHtml, "utf-8")
        );
        const informe = await InformeComiteModel.create({
          fichaId: ficha._id,
          casoId: caso._id,
          plantillaVersionId: new Types.ObjectId(input.plantillaVersionId),
          estado: "final",
          storageKeyHtml: htmlKey,
          apartadosManuales: new Map([
            ["apartado_analisis", apartadosDemo.analisis],
            ["apartado_recomendacion", apartadosDemo.recomendacion],
          ]),
          generadoPor: analistaOid,
          generadoAt: new Date(),
          finalizadoAt: new Date(),
          fichaVersion: 1,
        });
        try {
          const docxBuffer = await buildInformeDocx(informe._id.toString());
          informe.storageKeyDocx = await uploadInformeDocx(
            casoId,
            informe._id.toString(),
            docxBuffer
          );
          await informe.save();
        } catch (e) {
          console.warn(`    Aviso: sin Word demo para ${demo.numero}:`, e);
        }
      } else if (demo.conInformePreliminar) {
        const informeHtml = await buildInformeHtml(ficha._id.toString(), {
          estadoInforme: "Preliminar",
          apartadoAnalisis: apartadosDemo.analisis,
          apartadoRecomendacion: apartadosDemo.recomendacion,
        });
        const htmlKey = await uploadInformeHtml(
          casoId,
          ficha._id.toString(),
          Buffer.from(informeHtml, "utf-8")
        );
        await InformeComiteModel.create({
          fichaId: ficha._id,
          casoId: caso._id,
          plantillaVersionId: new Types.ObjectId(input.plantillaVersionId),
          estado: "preliminar",
          storageKeyHtml: htmlKey,
          apartadosManuales: new Map([
            ["apartado_analisis", apartadosDemo.analisis],
            ["apartado_recomendacion", apartadosDemo.recomendacion],
          ]),
          generadoPor: analistaOid,
          generadoAt: new Date(),
          fichaVersion: 1,
        });
      }
    }
  }

  console.log(`  Demo casos (${DEMO_SEED_VERSION}): ${config.casos.length} casos, ${config.contribuyentes.length} contribuyentes`);
  console.log("    Analista: analista@ecr-salud.local / Analista123!");
  console.log("    Por estado:");
  for (const [estado, count] of Object.entries(resumen).sort()) {
    console.log(`      ${estado}: ${count}`);
  }
  console.log("    Ejemplos: DEMO-01 revisión amarilla · DEMO-10 informe final · DEMO-24 calidad · DEMO-28 rechazado");
}

/** Regenera HTML (y Word si existe) de informes demo ya cargados — útil tras mejorar plantilla. */
export async function refreshDemoInformes(): Promise<number> {
  const casos = await CasoModel.find({ numero: /^FFA-2026-DEMO-/ });
  let actualizados = 0;

  for (const caso of casos) {
    const informe = await InformeComiteModel.findOne({ casoId: caso._id }).sort({ createdAt: -1 });
    if (!informe) continue;

    const manuales = informe.apartadosManuales as Map<string, string> | Record<string, string>;
    const getManual = (id: string): string => {
      if (manuales instanceof Map) return manuales.get(id) ?? "";
      return (manuales as Record<string, string>)[id] ?? "";
    };

    const html = await buildInformeHtml(informe.fichaId.toString(), {
      estadoInforme: informe.estado === "final" ? "Final" : "Preliminar",
      apartadoAnalisis: getManual("apartado_analisis"),
      apartadoRecomendacion: getManual("apartado_recomendacion"),
    });

    informe.storageKeyHtml = await uploadInformeHtml(
      caso._id.toString(),
      informe.fichaId.toString(),
      Buffer.from(html, "utf-8")
    );

    if (informe.storageKeyDocx) {
      try {
        const docxBuffer = await buildInformeDocx(informe._id.toString());
        informe.storageKeyDocx = await uploadInformeDocx(
          caso._id.toString(),
          informe._id.toString(),
          docxBuffer
        );
      } catch (e) {
        console.warn(`    Aviso: no se pudo regenerar Word para ${caso.numero}:`, e);
      }
    }

    await informe.save();
    actualizados++;
  }

  return actualizados;
}

/** Actualiza textos visibles de casos demo ya cargados (historial, validaciones, logs). */
export async function refreshDemoPresentacion(): Promise<number> {
  const config = JSON.parse(readFileSync(demoConfigPath, "utf-8")) as DemoConfig;
  const obsByNumero = new Map(config.casos.map((c) => [c.numero, c.observaciones]));

  await UserModel.updateOne(
    { email: "analista@ecr-salud.local" },
    { $set: { nombre: "Carolina Ríos" } }
  );

  await ContribuyenteModel.updateMany(
    { denominacionesAlternativas: "Clínica Demo" },
    { $pull: { denominacionesAlternativas: "Clínica Demo" } }
  );

  const casos = await CasoModel.find({ numero: /^FFA-2026-DEMO-/ });
  let actualizados = 0;

  for (const caso of casos) {
    const canal = resolveCanal(
      config.casos.find((c) => c.numero === caso.numero)?.canal
    );
    const obs = obsByNumero.get(caso.numero);
    const historial = caso.estadoHistorial?.length
      ? caso.estadoHistorial.map((h) => ({
          estado: h.estado,
          at: h.at,
          by: h.by,
          nota: notaHistorialEstado(h.estado as CasoEstado, canal),
        }))
      : undefined;

    const patch: Record<string, unknown> = {};
    if (historial) patch.estadoHistorial = historial;
    if (obs) patch.observaciones = obs;

    if (Object.keys(patch).length) {
      await CasoModel.updateOne({ _id: caso._id }, { $set: patch });
      actualizados++;
    }
  }

  const casoIds = casos.map((c) => c._id);
  if (casoIds.length) {
    const numeroByCasoId = new Map(casos.map((c) => [c._id.toString(), c.numero]));
    const cfgByNumero = new Map(config.casos.map((c) => [c.numero, c]));

    const docs = await DocumentoFuenteModel.find({ casoId: { $in: casoIds } });
    for (const doc of docs) {
      const numero = numeroByCasoId.get(doc.casoId.toString());
      const casoCfg = numero ? cfgByNumero.get(numero) : undefined;
      const razonSocial = doc.extractMetadata?.razonSocial ?? undefined;
      const docPatch: Record<string, unknown> = {
        preprocessLog: [
          { ...DOC_PREPROCESS_LOG, at: doc.preprocessLog?.[0]?.at ?? new Date() },
        ],
        normalizeLog: casoCfg?.sinLineas
          ? []
          : [{ ...DOC_NORMALIZE_LOG, at: doc.normalizeLog?.[0]?.at ?? new Date() }],
        "recepcion.remitente": remitenteDocumento(doc.canal as CanalRecepcion, razonSocial),
      };
      await DocumentoFuenteModel.updateOne({ _id: doc._id }, { $set: docPatch });
    }

    const demoCfgByCasoId = new Map(
      casos.map((c) => [c._id.toString(), config.casos.find((d) => d.numero === c.numero)])
    );

    const validaciones = await ValidacionResultadoModel.find({ casoId: { $in: casoIds } });
    for (const val of validaciones) {
      const cfg = demoCfgByCasoId.get(val.casoId.toString());
      if (!cfg) continue;
      const next =
        val.tipo === ValidacionTipo.CUADRATURA
          ? mensajeCuadratura(cfg.semaforo)
          : val.tipo === ValidacionTipo.COHERENCIA_ESTADOS
            ? mensajeCoherencia(cfg.semaforo)
            : val.mensaje;
      if (val.mensaje !== next) {
        val.mensaje = next;
        await val.save();
      }
    }

    await FichaCanonicaModel.updateMany(
      {
        casoId: { $in: casoIds },
        observaciones: /demo|seed/i,
      },
      { $set: { observaciones: "Revisión analítica completada sin observaciones adicionales" } }
    );
  }

  return actualizados;
}
