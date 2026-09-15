import type { LineaContableDto } from "@ffa/shared";

/** Misma normalización que el backend (@ffa/pipeline). */
export function normalizarDenominacionLinea(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Denominación base sin notas al pie ni encabezados OCR (alineado con pipeline). */
export function denomBaseBalanceLinea(texto: string): string {
  let d = normalizarDenominacionLinea(texto);
  d = d.replace(/\s+\d{1,3}$/, "");
  d = d.replace(/^activos corrientes\s+/i, "");
  d = d.replace(/^activos no corrientes\s+/i, "");
  d = d.replace(/^pasivos corrientes\s+/i, "");
  d = d.replace(/^pasivos no corrientes\s+/i, "");
  d = d.replace(/^patrimonio y pasivos\s+/i, "");
  return d.trim();
}

function dedupeFuzzyLineas(lineas: LineaContableDto[]): LineaContableDto[] {
  const grupos = new Map<string, LineaContableDto[]>();
  for (const l of lineas) {
    const base = denomBaseBalanceLinea(l.denominacionOriginal);
    if (!base) continue;
    const k = `${l.paginaNumero ?? 0}|${base}`;
    const g = grupos.get(k) ?? [];
    g.push(l);
    grupos.set(k, g);
  }
  const descartar = new Set<string>();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const keeper = [...grupo].sort(
      (a, b) => puntuacionConservarLinea(b) - puntuacionConservarLinea(a)
    )[0]!;
    for (const l of grupo) {
      if (l.id !== keeper.id) descartar.add(l.id);
    }
  }
  return descartar.size ? lineas.filter((l) => !descartar.has(l.id)) : lineas;
}

export function lineaDuplicadoKey(
  l: Pick<
    LineaContableDto,
    "denominacionNormalizada" | "denominacionOriginal" | "montoNormalizado" | "montoOriginal"
  >
): string {
  const raw = l.denominacionNormalizada ?? l.denominacionOriginal;
  const denom = normalizarDenominacionLinea(raw);
  const monto = l.montoNormalizado ?? l.montoOriginal;
  return `${denom}|${monto}`;
}

export function puntuacionConservarLinea(l: LineaContableDto): number {
  let score = 0;
  if (l.rubroInstitucionalId) score += 10_000;
  if (l.estado === "aprobada") score += 5_000;
  score += (l.confianzaClasificacion ?? 0) * 10;
  score += l.confianzaExtraccion ?? 0;
  const origen = l.origenClasificacion ?? "";
  if (origen === "regla") score += 800;
  else if (origen === "semantica") score += 600;
  else if (origen === "manual") score += 400;
  if (l.denominacionOriginal.includes("—")) score += 200;
  return score;
}

function elegirConservarGrupo(grupo: LineaContableDto[]): LineaContableDto {
  return [...grupo].sort((a, b) => {
    const diff = puntuacionConservarLinea(b) - puntuacionConservarLinea(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export function analizarDuplicadosLineas(lineas: LineaContableDto[]): {
  /** Filas que se eliminarían (excluye la que se conserva por grupo). */
  duplicadasCount: number;
  gruposCount: number;
  idsEnGrupoDuplicado: Set<string>;
} {
  const byKey = new Map<string, LineaContableDto[]>();
  for (const l of lineas) {
    const k = lineaDuplicadoKey(l);
    const g = byKey.get(k) ?? [];
    g.push(l);
    byKey.set(k, g);
  }

  let duplicadasCount = 0;
  let gruposCount = 0;
  const idsEnGrupoDuplicado = new Set<string>();

  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    gruposCount += 1;
    duplicadasCount += group.length - 1;
    for (const l of group) idsEnGrupoDuplicado.add(l.id);
  }

  return { duplicadasCount, gruposCount, idsEnGrupoDuplicado };
}

/** Vista colapsada: una fila por grupo duplicado (la que se conservaría al eliminar). */
export function colapsarDuplicadosLineas(lineas: LineaContableDto[]): {
  lineasVisibles: LineaContableDto[];
  /** Cuántas filas iguales están ocultas junto a la fila visible (id → cantidad oculta). */
  ocultasPorId: Record<string, number>;
  duplicadasCount: number;
  gruposCount: number;
  idsEnGrupoDuplicado: Set<string>;
} {
  const preFuzzy = dedupeFuzzyLineas(lineas);
  const byKey = new Map<string, LineaContableDto[]>();
  for (const l of preFuzzy) {
    const k = lineaDuplicadoKey(l);
    const g = byKey.get(k) ?? [];
    g.push(l);
    byKey.set(k, g);
  }

  const keeperByKey = new Map<string, LineaContableDto>();
  const ocultasPorId: Record<string, number> = {};
  let duplicadasCount = 0;
  let gruposCount = 0;
  const idsEnGrupoDuplicado = new Set<string>();

  for (const [key, group] of byKey) {
    if (group.length <= 1) {
      keeperByKey.set(key, group[0]!);
      continue;
    }
    gruposCount += 1;
    duplicadasCount += group.length - 1;
    for (const l of group) idsEnGrupoDuplicado.add(l.id);
    const keeper = elegirConservarGrupo(group);
    keeperByKey.set(key, keeper);
    ocultasPorId[keeper.id] = group.length - 1;
  }

  const seen = new Set<string>();
  const lineasVisibles: LineaContableDto[] = [];
  for (const l of preFuzzy) {
    const key = lineaDuplicadoKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    lineasVisibles.push(keeperByKey.get(key)!);
  }

  return { lineasVisibles, ocultasPorId, duplicadasCount, gruposCount, idsEnGrupoDuplicado };
}

export function esLineaEnGrupoDuplicado(l: LineaContableDto, ids: Set<string>): boolean {
  return ids.has(l.id);
}

function montoAbsLinea(l: LineaContableDto): number {
  return Math.abs(l.montoNormalizado ?? l.montoOriginal);
}

/** Denominación base sin sufijos de columna OCR (« 24», « 26»). */
export function denomBaseParaEscala(linea: LineaContableDto): string {
  let d = normalizarDenominacionLinea(linea.denominacionNormalizada ?? linea.denominacionOriginal);
  d = d.replace(/\s+\d{1,3}$/, "");
  return d;
}

const FACTOR_ESCALA_DUPLICADO = 1000;

/**
 * Misma partida con monto ×1000 (error OCR / escala): conserva el de mayor magnitud.
 * Solo para cuadratura — no modifica la lista en pantalla.
 */
export function colapsarDuplicadosEscala(lineas: LineaContableDto[]): LineaContableDto[] {
  const byDenom = new Map<string, LineaContableDto[]>();
  for (const l of lineas) {
    const k = denomBaseParaEscala(l);
    const g = byDenom.get(k) ?? [];
    g.push(l);
    byDenom.set(k, g);
  }

  const out: LineaContableDto[] = [];
  for (const grupo of byDenom.values()) {
    if (grupo.length <= 1) {
      out.push(grupo[0]!);
      continue;
    }

    const ordenadas = [...grupo].sort((a, b) => montoAbsLinea(b) - montoAbsLinea(a));
    const descartadas = new Set<string>();

    for (let i = 0; i < ordenadas.length; i++) {
      const mayor = ordenadas[i]!;
      if (descartadas.has(mayor.id)) continue;
      const mMayor = montoAbsLinea(mayor);
      if (mMayor === 0) {
        out.push(mayor);
        descartadas.add(mayor.id);
        continue;
      }

      for (let j = i + 1; j < ordenadas.length; j++) {
        const menor = ordenadas[j]!;
        if (descartadas.has(menor.id)) continue;
        const mMenor = montoAbsLinea(menor);
        if (mMenor === 0) continue;
        const ratio = mMayor / mMenor;
        if (ratio >= FACTOR_ESCALA_DUPLICADO * 0.9 && ratio <= FACTOR_ESCALA_DUPLICADO * 1.1) {
          descartadas.add(menor.id);
        }
      }

      if (!descartadas.has(mayor.id)) {
        out.push(mayor);
        descartadas.add(mayor.id);
      }
    }
  }

  return out;
}
