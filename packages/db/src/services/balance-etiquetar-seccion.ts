import {
  analizarBalance,
  buscarFilaPdfPorMonto,
  denominacionConSeccionBalance,
  extractPdfPageTextRows,
  filtrarRubrosAsignables,
  normalizarDenominacion,
  parseFilasBalancePdfPage,
  sugerirRubroCodigoBalance,
} from "@ffa/pipeline";
import { LineaEstado } from "@ffa/shared";
import { LineaContableModel } from "../models/linea-contable.js";
import { CasoModel } from "../models/caso.js";
import { DocumentoFuenteModel } from "../models/documento-fuente.js";
import { RubroInstitucionalModel } from "../models/rubro-institucional.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  throw new Error(`PDF no encontrado: ${storageKey}`);
}

/** Etiqueta NC/corriente y elimina duplicados entre pág. principal y secundarias del balance. */
export async function etiquetarYDepurarLineasBalance(
  casoId: string
): Promise<{ etiquetadas: number; eliminadasSecundarias: number; mensaje: string }> {
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) {
    return { etiquetadas: 0, eliminadasSecundarias: 0, mensaje: "Caso sin plan" };
  }

  const documento = await DocumentoFuenteModel.findOne({ casoId }).sort({ createdAt: 1 });
  if (!documento?.storageKey) {
    return { etiquetadas: 0, eliminadasSecundarias: 0, mensaje: "Sin documento" };
  }

  const lineas = await LineaContableModel.find({ casoId });
  const rubrosDocs = await RubroInstitucionalModel.find({
    planCuentasVersionId: caso.planCuentasVersionId,
    activo: true,
  });
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

  const analisis = analizarBalance(
    lineas.map((l) => ({
      id: l._id.toString(),
      denominacionOriginal: l.denominacionOriginal,
      montoOriginal: l.montoOriginal,
      montoNormalizado: l.montoNormalizado ?? undefined,
      paginaNumero: l.paginaNumero,
      rubroCodigo: l.rubroCodigo ?? undefined,
      excluirDeCuadratura: l.excluirDeCuadratura ?? false,
    })),
    refs
  );

  const paginaBalance = analisis.testigoRecomendado?.paginaNumero;
  if (!paginaBalance) {
    return { etiquetadas: 0, eliminadasSecundarias: 0, mensaje: "Sin testigo balance" };
  }

  let etiquetadas = 0;
  let corregidasRubro = 0;
  const rubroByCodigo = new Map(rubrosDocs.map((r) => [r.codigo, r]));

  try {
    const texto = await extractPdfPageTextRows(readPdfBuffer(documento.storageKey), paginaBalance);
    const filasPdf = parseFilasBalancePdfPage(texto, { escala: caso.escala ?? undefined });
    const lineasPagina = lineas.filter((l) => l.paginaNumero === paginaBalance);

    const rubrosDuplicados = new Set<string>();
    const porRubro = new Map<string, number>();
    for (const l of lineasPagina) {
      if (!l.rubroCodigo) continue;
      porRubro.set(l.rubroCodigo, (porRubro.get(l.rubroCodigo) ?? 0) + 1);
    }
    for (const [codigo, n] of porRubro) {
      if (n > 1) rubrosDuplicados.add(codigo);
    }

    for (const linea of lineasPagina) {
      const m = linea.montoNormalizado ?? linea.montoOriginal;
      const filaPdf = buscarFilaPdfPorMonto(filasPdf, m, {
        denominacionHint: linea.denominacionOriginal,
      });
      if (!filaPdf) continue;

      const rubroPdf = sugerirRubroCodigoBalance(filaPdf.denominacion);
      const nuevaDenom = denominacionConSeccionBalance(filaPdf.denominacion, filaPdf.seccion);

      if (
        rubroPdf &&
        linea.rubroCodigo &&
        rubroPdf !== linea.rubroCodigo &&
        (linea.origenClasificacion === "manual" ||
          (linea.confianzaClasificacion ?? 0) < 85 ||
          linea.origenClasificacion === "ia_pre_revision")
      ) {
        const rubroDoc = rubroByCodigo.get(rubroPdf);
        if (rubroDoc) {
          await LineaContableModel.updateOne(
            { _id: linea._id, casoId },
            {
              $set: {
                rubroInstitucionalId: rubroDoc._id,
                rubroCodigo: rubroDoc.codigo,
                clasificacionPropuesta: rubroDoc._id,
                denominacionOriginal: nuevaDenom,
                denominacionNormalizada: normalizarDenominacion(nuevaDenom),
                origenClasificacion: "manual",
                confianzaClasificacion: Math.max(linea.confianzaClasificacion ?? 0, 82),
                requiereRevision: false,
                estado: LineaEstado.CLASIFICADA,
              },
            }
          );
          corregidasRubro++;
          etiquetadas++;
          continue;
        }
      }

      if (!filaPdf.seccion || !linea.rubroCodigo || !rubrosDuplicados.has(linea.rubroCodigo)) {
        continue;
      }
      if (nuevaDenom === linea.denominacionOriginal) continue;

      await LineaContableModel.updateOne(
        { _id: linea._id, casoId },
        {
          $set: {
            denominacionOriginal: nuevaDenom,
            denominacionNormalizada: normalizarDenominacion(nuevaDenom),
          },
        }
      );
      etiquetadas++;
    }
  } catch {
    /* PDF opcional */
  }

  const paginasSec = analisis.paginasBalanceObjetivo.filter((p) => p !== paginaBalance);
  let eliminadasSecundarias = 0;
  if (paginasSec.length) {
    const principales = lineas.filter((l) => l.paginaNumero === paginaBalance);
    const idsEliminar: string[] = [];

    for (const p of paginasSec) {
      for (const sec of lineas.filter((l) => l.paginaNumero === p)) {
        if (!sec.rubroCodigo) continue;
        const normSec = normalizarDenominacion(sec.denominacionOriginal).replace(
          /\s+(activo|pasivo)\s+(no\s+)?corriente$/,
          ""
        );
        const dup = principales.find(
          (pr) =>
            pr.rubroCodigo === sec.rubroCodigo &&
            normalizarDenominacion(pr.denominacionOriginal).replace(
              /\s+(activo|pasivo)\s+(no\s+)?corriente$/,
              ""
            ) === normSec
        );
        if (dup) idsEliminar.push(sec._id.toString());
      }
    }

    if (idsEliminar.length) {
      const res = await LineaContableModel.deleteMany({
        _id: { $in: idsEliminar },
        casoId,
      });
      eliminadasSecundarias = res.deletedCount ?? idsEliminar.length;
    }
  }

  const partes: string[] = [];
  if (etiquetadas) partes.push(`${etiquetadas} etiquetada(s) NC/corriente`);
  if (corregidasRubro) partes.push(`${corregidasRubro} rubro(s) corregido(s) vs PDF`);
  if (eliminadasSecundarias) partes.push(`${eliminadasSecundarias} redundante(s) en pág. secundaria(s)`);

  return {
    etiquetadas,
    eliminadasSecundarias,
    mensaje: partes.length ? partes.join("; ") : "Sin duplicados semánticos",
  };
}
