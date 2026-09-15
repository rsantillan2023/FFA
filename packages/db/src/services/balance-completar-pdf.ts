import {
  analizarBalance,
  denominacionConSeccionBalance,
  esLineaFilaTotalBalance,
  extractPdfPageTextRows,
  filtrarRubrosAsignables,
  filaPdfYaExiste,
  parseFilasBalancePdfPage,
  sugerirRubroCodigoBalance,
} from "@ffa/pipeline";
import { LineaEstado } from "@ffa/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Types } from "mongoose";
import { CasoModel } from "../models/caso.js";
import { DocumentoFuenteModel } from "../models/documento-fuente.js";
import { LineaContableModel } from "../models/linea-contable.js";
import { RubroInstitucionalModel } from "../models/rubro-institucional.js";

function readPdfBuffer(storageKey: string): Buffer {
  const bases = [
    process.env.LOCAL_STORAGE_PATH,
    resolve(process.cwd(), "apps/api/data/storage"),
    resolve(process.cwd(), "data/storage"),
  ].filter(Boolean) as string[];

  for (const base of bases) {
    try {
      return readFileSync(resolve(base, storageKey));
    } catch {
      /* try next */
    }
  }
  throw new Error(`PDF no encontrado en storage: ${storageKey}`);
}

function multiplicadorNormalizado(escala?: string): number {
  if (escala === "millones") return 1_000_000;
  if (escala === "miles") return 1_000;
  return 1;
}

/** Inserta líneas de detalle faltantes parseando todas las páginas objetivo del balance. */
export async function completarLineasBalanceDesdePdf(
  casoId: string
): Promise<{ insertadas: number; mensaje: string }> {
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) {
    return { insertadas: 0, mensaje: "Caso sin plan de cuentas" };
  }

  const [lineas, rubrosDocs, documento] = await Promise.all([
    LineaContableModel.find({ casoId }),
    RubroInstitucionalModel.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true }),
    DocumentoFuenteModel.findOne({ casoId }).sort({ createdAt: 1 }),
  ]);

  if (!documento?.storageKey) {
    return { insertadas: 0, mensaje: "Sin documento fuente" };
  }

  const refs = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    estadoFinanciero: r.estadoFinanciero,
    asignable: filtrarRubrosAsignables([
      {
        id: r._id.toString(),
        codigo: r.codigo,
        nombre: r.nombre,
        estadoFinanciero: r.estadoFinanciero,
        convencionSigno: r.convencionSigno,
      },
    ]).some((x) => x.id === r._id.toString()),
  }));

  const inputs = lineas.map((l) => ({
    id: l._id.toString(),
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
    paginaNumero: l.paginaNumero,
    rubroInstitucionalId: l.rubroInstitucionalId?.toString(),
    rubroCodigo: l.rubroCodigo ?? undefined,
    excluirDeCuadratura: l.excluirDeCuadratura ?? false,
  }));

  const analisis = analizarBalance(inputs, refs);
  const paginasObjetivo = analisis.paginasBalanceObjetivo.length
    ? analisis.paginasBalanceObjetivo
    : analisis.testigoRecomendado
      ? [analisis.testigoRecomendado.paginaNumero]
      : [];

  const provenance = (
    documento.extractPayload as {
      provenanceExtraccion?: { textoNativoPrimario?: boolean; lineasOmitidasEstimadas?: number };
    }
  )?.provenanceExtraccion;

  /** FINYX / PDF nativo completo: no re-parsear páginas (genera duplicados y sin rubro). */
  if (provenance?.textoNativoPrimario && (provenance.lineasOmitidasEstimadas ?? 0) === 0) {
    const ratio = analisis.ratioActivoVsTestigo;
    if (ratio != null && ratio >= 92 && ratio <= 108) {
      return { insertadas: 0, mensaje: "Omitido — extracción nativa primaria completa" };
    }
  }

  if (!paginasObjetivo.length) {
    return { insertadas: 0, mensaje: "Sin páginas de balance detectadas" };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readPdfBuffer(documento.storageKey);
  } catch (e) {
    return { insertadas: 0, mensaje: e instanceof Error ? e.message : "PDF no accesible" };
  }

  const parseOpts = { escala: caso.escala ?? undefined };
  const normMult = multiplicadorNormalizado(caso.escala ?? undefined);
  const rubroByCodigo = new Map(rubrosDocs.map((r) => [r.codigo, r]));

  const toFilaLike = (l: (typeof lineas)[0]) => ({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  });

  let lineasLike = lineas.map(toFilaLike);
  let insertadas = 0;
  const paginasConInsert: number[] = [];

  for (const pagina of paginasObjetivo) {
    let texto: string;
    try {
      texto = await extractPdfPageTextRows(pdfBuffer, pagina);
    } catch {
      continue;
    }

    const filasPdf = parseFilasBalancePdfPage(texto, parseOpts);
    const lineasPagina = lineas.filter((l) => l.paginaNumero === pagina).map(toFilaLike);
    let insertadasPagina = 0;

    for (const fila of filasPdf) {
      if (
        esLineaFilaTotalBalance({
          denominacionOriginal: fila.denominacion,
          montoOriginal: fila.monto,
        })
      ) {
        continue;
      }
      if (filaPdfYaExiste(fila, lineasPagina)) continue;
      if (filaPdfYaExiste(fila, lineasLike)) continue;

      const rubroCodigo = sugerirRubroCodigoBalance(fila.denominacion);
      const rubro = rubroCodigo ? rubroByCodigo.get(rubroCodigo) : undefined;
      const denom = denominacionConSeccionBalance(fila.denominacion, fila.seccion);
      const montoNorm = fila.monto * normMult;

      await LineaContableModel.create({
        casoId: new Types.ObjectId(casoId),
        documentoId: documento._id,
        paginaNumero: pagina,
        denominacionOriginal: denom,
        montoOriginal: fila.monto,
        montoNormalizado: montoNorm,
        rubroInstitucionalId: rubro?._id,
        rubroCodigo: rubro?.codigo,
        clasificacionPropuesta: rubro?._id,
        confianzaExtraccion: 88,
        confianzaClasificacion: rubro ? 85 : 40,
        origenClasificacion: rubro ? "regla" : "asistida",
        requiereRevision: !rubro,
        estado: rubro ? LineaEstado.CLASIFICADA : LineaEstado.NORMALIZADA,
      });

      lineasLike = [
        ...lineasLike,
        { denominacionOriginal: denom, montoOriginal: fila.monto, montoNormalizado: montoNorm },
      ];
      insertadas++;
      insertadasPagina++;
    }

    if (insertadasPagina > 0) paginasConInsert.push(pagina);
  }

  return {
    insertadas,
    mensaje:
      insertadas > 0
        ? `${insertadas} línea(s) recuperada(s) desde PDF pág. ${paginasConInsert.join(", ")}`
        : "Sin líneas faltantes detectadas en PDF",
  };
}
