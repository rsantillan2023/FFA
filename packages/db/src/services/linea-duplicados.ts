import { denomBaseBalance, montosCasiIguales, normalizarDenominacion } from "@ffa/pipeline";
import { LineaEstado } from "@ffa/shared";
import { LineaContableModel, type LineaContableDocument } from "../models/linea-contable.js";

export function lineaDuplicadoKey(linea: LineaContableDocument): string {
  const denom =
    linea.denominacionNormalizada ?? normalizarDenominacion(linea.denominacionOriginal);
  const monto = linea.montoNormalizado ?? linea.montoOriginal;
  return `${denom}\0${monto}`;
}

/** Misma página, rubro y monto (denominación distinta por OCR). */
export function lineaDuplicadoRubroPaginaKey(linea: LineaContableDocument): string | null {
  if (!linea.paginaNumero || !linea.rubroCodigo) return null;
  const monto = linea.montoNormalizado ?? linea.montoOriginal;
  return `${linea.paginaNumero}\0${linea.rubroCodigo}\0${monto}`;
}

/** Misma página, rubro y denominación normalizada (montos casi iguales por OCR). */
export function lineaDuplicadoRubroPaginaDenomKey(linea: LineaContableDocument): string | null {
  if (!linea.paginaNumero || !linea.rubroCodigo) return null;
  const denom =
    linea.denominacionNormalizada ?? normalizarDenominacion(linea.denominacionOriginal);
  return `${linea.paginaNumero}\0${linea.rubroCodigo}\0${denom}`;
}

export function puntuacionConservarLinea(linea: LineaContableDocument): number {
  let score = 0;
  if (linea.rubroInstitucionalId) score += 10_000;
  if (linea.estado === LineaEstado.APROBADA) score += 5_000;
  score += (linea.confianzaClasificacion ?? 0) * 10;
  score += linea.confianzaExtraccion ?? 0;
  const origen = linea.origenClasificacion;
  if (origen === "regla") score += 800;
  else if (origen === "semantica") score += 600;
  else if (origen === "manual") score += 400;
  if (linea.denominacionOriginal.includes("—")) score += 200;
  return score;
}

/** Elimina líneas duplicadas (mismo concepto normalizado y monto), conservando la mejor clasificada. */
export async function eliminarLineasDuplicadasCaso(
  casoId: string
): Promise<{ eliminadas: number; grupos: number; conservadas: number }> {
  const lineas = await LineaContableModel.find({ casoId });
  const idsEliminar = new Set<string>();
  let gruposConDuplicados = 0;

  function procesarGrupos(
    grupos: Map<string, LineaContableDocument[]>,
    minMiembros = 2
  ): void {
    for (const miembros of grupos.values()) {
      if (miembros.length < minMiembros) continue;
      gruposConDuplicados += 1;

      const ordenadas = [...miembros].sort((a, b) => {
        const diff = puntuacionConservarLinea(b) - puntuacionConservarLinea(a);
        if (diff !== 0) return diff;
        const lenA = a.denominacionOriginal.length;
        const lenB = b.denominacionOriginal.length;
        if (lenA !== lenB) return lenA - lenB;
        return a._id.toString().localeCompare(b._id.toString());
      });

      for (const dup of ordenadas.slice(1)) {
        idsEliminar.add(dup._id.toString());
      }
    }
  }

  const gruposDenom = new Map<string, LineaContableDocument[]>();
  const gruposRubroPag = new Map<string, LineaContableDocument[]>();
  const gruposRubroPagDenom = new Map<string, LineaContableDocument[]>();
  const gruposFuzzy = new Map<string, LineaContableDocument[]>();

  for (const linea of lineas) {
    const fuzzyKey = `${linea.paginaNumero ?? 0}|${denomBaseBalance(linea.denominacionOriginal)}`;
    const listF = gruposFuzzy.get(fuzzyKey) ?? [];
    listF.push(linea);
    gruposFuzzy.set(fuzzyKey, listF);

    const key = lineaDuplicadoKey(linea);
    const list = gruposDenom.get(key) ?? [];
    list.push(linea);
    gruposDenom.set(key, list);

    const keyRp = lineaDuplicadoRubroPaginaKey(linea);
    if (keyRp) {
      const listRp = gruposRubroPag.get(keyRp) ?? [];
      listRp.push(linea);
      gruposRubroPag.set(keyRp, listRp);
    }

    const keyRpd = lineaDuplicadoRubroPaginaDenomKey(linea);
    if (keyRpd) {
      const listRpd = gruposRubroPagDenom.get(keyRpd) ?? [];
      listRpd.push(linea);
      gruposRubroPagDenom.set(keyRpd, listRpd);
    }
  }

  procesarGrupos(gruposDenom);
  procesarGrupos(gruposRubroPag);
  procesarGrupos(gruposFuzzy);

  /** OCR: misma fila con montos que difieren <0,5% (p. ej. 1.301B vs 1.303B). */
  for (const miembros of gruposRubroPagDenom.values()) {
    if (miembros.length < 2) continue;
    const montos = miembros.map((l) => l.montoNormalizado ?? l.montoOriginal);
    const ref = montos[0]!;
    if (!montos.every((m) => montosCasiIguales(m, ref))) continue;
    gruposConDuplicados += 1;

    const ordenadas = [...miembros].sort((a, b) => {
      const diff = puntuacionConservarLinea(b) - puntuacionConservarLinea(a);
      if (diff !== 0) return diff;
      return a._id.toString().localeCompare(b._id.toString());
    });
    for (const dup of ordenadas.slice(1)) {
      idsEliminar.add(dup._id.toString());
    }
  }

  if (idsEliminar.size === 0) {
    return { eliminadas: 0, grupos: 0, conservadas: lineas.length };
  }

  const res = await LineaContableModel.deleteMany({
    _id: { $in: [...idsEliminar] },
    casoId,
  });

  return {
    eliminadas: res.deletedCount ?? idsEliminar.size,
    grupos: gruposConDuplicados,
    conservadas: lineas.length - (res.deletedCount ?? idsEliminar.size),
  };
}
