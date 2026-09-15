import { evaluarCuadraturaBalance } from "@ffa/shared";
import { normalizarDenominacion } from "../utils/text.js";
import {
  colapsarDuplicadosEscala,
  esLineaFilaTotalBalance,
  montoLineaBalance,
  motivoExclusionCuadratura,
  type LineaBalanceLike,
  type MotivoExclusionCuadratura,
  type RubroBalanceLike,
} from "./balance-filters.js";
import { colapsarDuplicadosLineas } from "./linea-duplicados.js";

export interface TestigoBalance {
  paginaNumero: number;
  totalActivo: number;
  totalPasivoPatrimonio: number;
  cuadra: boolean;
  lineaActivoId?: string;
  lineaPasivoPatId?: string;
}

export interface BalanceAnalisis {
  testigos: TestigoBalance[];
  testigoRecomendado: TestigoBalance | null;
  paginasBalanceObjetivo: number[];
  totales: {
    activo: number;
    pasivo: number;
    patrimonio: number;
    resultados: number;
    cuadraturaOk: boolean;
    diferencia: number;
  };
  conteos: Record<MotivoExclusionCuadratura | "detalle", number>;
  paresEscala: number;
  patrimonioMalEnPasivo: number;
  /** Activo en cuadratura muy por debajo del total activo del PDF. */
  activoIncompleto: boolean;
  ratioActivoVsTestigo: number | null;
}

export interface AccionReconciliacion {
  tipo:
    | "excluir_cuadratura"
    | "eliminar_escala"
    | "reclasificar_rubro"
    | "incluir_cuadratura"
    | "ajuste_cuadratura";
  lineaId?: string;
  descripcion: string;
  rubroCodigoDestino?: string;
  monto?: number;
}

const PRIORIDAD_ACCION: Record<AccionReconciliacion["tipo"], number> = {
  reclasificar_rubro: 1,
  incluir_cuadratura: 2,
  eliminar_escala: 3,
  excluir_cuadratura: 4,
  ajuste_cuadratura: 5,
};

function normDenom(s: string): string {
  return normalizarDenominacion(s);
}

function esDenominacionTotalActivo(d: string): boolean {
  return (
    /^total del activo$/i.test(d) ||
    /^total de activos$/i.test(d) ||
    /^total activos$/i.test(d) ||
    /^activos totales$/i.test(d) ||
    /^total activo$/i.test(d)
  );
}

function esDenominacionTotalPasivoPatrimonio(d: string): boolean {
  return (
    /^total del pasivo y patrimonio( neto)?$/i.test(d) ||
    /^total de patrimonio y pasivos$/i.test(d) ||
    /^total patrimonio y pasivos$/i.test(d) ||
    /^patrimonio y pasivos totales$/i.test(d) ||
    /^pasivo y patrimonio neto$/i.test(d) ||
    /^total del pasivo y patrimonio neto$/i.test(d)
  );
}

function montosTestigoCuadran(a: number, b: number): boolean {
  return Math.abs(a - b) / Math.max(a, 1) < 0.02;
}

export function detectarTestigosBalance(
  lineas: Array<LineaBalanceLike & { id: string }>
): TestigoBalance[] {
  const totalesActivo = lineas.filter((l) =>
    esDenominacionTotalActivo(normDenom(l.denominacionOriginal))
  );
  const totalesPP = lineas.filter((l) =>
    esDenominacionTotalPasivoPatrimonio(normDenom(l.denominacionOriginal))
  );

  const testigos: TestigoBalance[] = [];
  for (const ta of totalesActivo) {
    const mA = montoLineaBalance(ta);
    if (mA < 1e6) continue;
    const pagAct = ta.paginaNumero ?? 0;
    let tp = totalesPP.find(
      (p) => p.paginaNumero === pagAct && montosTestigoCuadran(mA, montoLineaBalance(p))
    );
    if (!tp) {
      tp = lineas.find(
        (p) =>
          p.paginaNumero === pagAct &&
          montosTestigoCuadran(mA, montoLineaBalance(p)) &&
          /patrimonio|pasivos/i.test(normDenom(p.denominacionOriginal)) &&
          /total/i.test(normDenom(p.denominacionOriginal))
      );
    }
    /** FINYX: activo en pág. N y patrimonio+pasivos en pág. N+1 (mismo monto). */
    if (!tp) {
      tp = totalesPP.find((p) => {
        const pagP = p.paginaNumero ?? 0;
        if (pagP <= 0 || Math.abs(pagP - pagAct) > 2) return false;
        return montosTestigoCuadran(mA, montoLineaBalance(p));
      });
    }
    if (!tp) {
      tp = lineas.find((p) => {
        const pagP = p.paginaNumero ?? 0;
        if (pagP <= 0 || Math.abs(pagP - pagAct) > 2) return false;
        if (!montosTestigoCuadran(mA, montoLineaBalance(p))) return false;
        return (
          /patrimonio|pasivos/i.test(normDenom(p.denominacionOriginal)) &&
          /total/i.test(normDenom(p.denominacionOriginal))
        );
      });
    }
    if (!tp) continue;
    const mPP = montoLineaBalance(tp);
    testigos.push({
      paginaNumero: ta.paginaNumero ?? 0,
      totalActivo: mA,
      totalPasivoPatrimonio: mPP,
      cuadra: true,
      lineaActivoId: ta.id,
      lineaPasivoPatId: tp.id,
    });
  }

  /** Misma página con par ×1000: conservar el de escala «miles» (menor magnitud). */
  const porPagina = new Map<number, TestigoBalance>();
  for (const t of testigos) {
    const prev = porPagina.get(t.paginaNumero);
    if (!prev) {
      porPagina.set(t.paginaNumero, t);
      continue;
    }
    const ratio = Math.max(prev.totalActivo, t.totalActivo) / Math.min(prev.totalActivo, t.totalActivo);
    if (ratio >= 900 && ratio <= 1100) {
      porPagina.set(
        t.paginaNumero,
        prev.totalActivo < t.totalActivo ? prev : t
      );
    } else if (t.totalActivo > prev.totalActivo) {
      porPagina.set(t.paginaNumero, t);
    }
  }

  return [...porPagina.values()].sort((a, b) => b.totalActivo - a.totalActivo);
}

function inferirPaginasBalance(
  lineas: Array<LineaBalanceLike & { id: string; paginaNumero?: number }>,
  testigo: TestigoBalance | null
): number[] {
  if (!testigo) return [];
  const p0 = testigo.paginaNumero;
  const pagPP =
    lineas.find((l) => l.id === testigo.lineaPasivoPatId)?.paginaNumero ?? p0;
  const minP = Math.min(p0, pagPP);
  const maxP = Math.max(p0, pagPP);
  const candidatas = new Set<number>(
    [p0, p0 - 1, p0 + 1, pagPP, minP, maxP, minP - 1, maxP + 1].filter((p) => p > 0)
  );
  for (const l of lineas) {
    const p = l.paginaNumero ?? 0;
    if (p >= p0 - 1 && p <= p0 + 1) candidatas.add(p);
  }
  return [...candidatas].sort((a, b) => a - b);
}

function resolveRubro(
  l: LineaBalanceLike & { rubroInstitucionalId?: string; rubroCodigo?: string },
  byId: Map<string, RubroBalanceLike>,
  byCodigo: Map<string, RubroBalanceLike>
): RubroBalanceLike | undefined {
  if (l.rubroInstitucionalId) {
    const r = byId.get(l.rubroInstitucionalId);
    if (r) return r;
  }
  if (l.rubroCodigo) return byCodigo.get(l.rubroCodigo);
  return undefined;
}

export function analizarBalance(
  lineas: Array<
    LineaBalanceLike & { id: string; rubroInstitucionalId?: string; rubroCodigo?: string; paginaNumero?: number }
  >,
  rubros: RubroBalanceLike[],
  paginasObjetivo?: number[]
): BalanceAnalisis {
  const byId = new Map(rubros.map((r) => [r.id, r]));
  const byCodigo = new Map(rubros.map((r) => [r.codigo, r]));

  const testigos = detectarTestigosBalance(lineas);
  const testigoRecomendado = testigos[0] ?? null;
  const paginasBalanceObjetivo = paginasObjetivo?.length
    ? paginasObjetivo
    : inferirPaginasBalance(lineas, testigoRecomendado);

  const conteos: Record<MotivoExclusionCuadratura | "detalle", number> = {
    sin_rubro: 0,
    resultados: 0,
    agrupador: 0,
    total: 0,
    ruido: 0,
    flujo_efectivo: 0,
    flujo_caja: 0,
    tabla_segmentos: 0,
    er_en_balance: 0,
    comparativa: 0,
    otro_estado: 0,
    manual: 0,
    detalle: 0,
  };

  let paresEscala = 0;
  const byDenom = new Map<string, number[]>();
  for (const l of lineas) {
    const k = normDenom(l.denominacionOriginal).replace(/\s+\d{1,3}$/, "");
    const arr = byDenom.get(k) ?? [];
    arr.push(Math.abs(montoLineaBalance(l)));
    byDenom.set(k, arr);
  }
  for (const arr of byDenom.values()) {
    if (arr.length < 2) continue;
    const max = Math.max(...arr);
    for (const m of arr) {
      if (m === 0 || m === max) continue;
      const ratio = max / m;
      if (ratio >= 900 && ratio <= 1100) paresEscala++;
    }
  }

  let patrimonioMalEnPasivo = 0;
  const colapsadas = colapsarDuplicadosEscala(colapsarDuplicadosLineas(lineas));

  let activo = 0;
  let pasivo = 0;
  let patrimonio = 0;
  let resultados = 0;

  for (const l of colapsadas) {
    const rubro = resolveRubro(l, byId, byCodigo);
    let motivo = motivoExclusionCuadratura(l, rubro);

    if (
      !motivo &&
      paginasBalanceObjetivo.length &&
      l.paginaNumero &&
      !paginasBalanceObjetivo.includes(l.paginaNumero)
    ) {
      motivo = "otro_estado";
    }

    if (motivo) {
      conteos[motivo]++;
      if (
        motivo !== "resultados" &&
        /patrimonio|controlante|no controlante|acciones en circulacion|capital|reservas|resultados no asignados/i.test(
          l.denominacionOriginal
        ) &&
        rubro?.estadoFinanciero === "pasivo"
      ) {
        patrimonioMalEnPasivo += montoLineaBalance(l);
      }
      continue;
    }

    conteos.detalle++;
    const m = montoLineaBalance(l);
    if (rubro?.estadoFinanciero === "activo") activo += m;
    else if (rubro?.estadoFinanciero === "pasivo") pasivo += m;
    else if (rubro?.estadoFinanciero === "patrimonio") patrimonio += m;
    else if (rubro?.estadoFinanciero === "resultados") resultados += m;
  }

  const evalCuad = evaluarCuadraturaBalance(activo, pasivo, patrimonio);
  const testigoActivo = testigoRecomendado?.totalActivo ?? 0;
  const ratioActivoVsTestigo =
    testigoActivo > 0 && activo > 0 ? Math.round(1000 * (activo / testigoActivo)) / 10 : null;
  const activoIncompleto = ratioActivoVsTestigo != null && ratioActivoVsTestigo < 85;

  return {
    testigos,
    testigoRecomendado,
    paginasBalanceObjetivo,
    totales: {
      activo,
      pasivo,
      patrimonio,
      resultados,
      cuadraturaOk: evalCuad.cuadraturaOk,
      diferencia: evalCuad.diferencia,
    },
    conteos,
    paresEscala,
    patrimonioMalEnPasivo,
    activoIncompleto,
    ratioActivoVsTestigo,
  };
}

const PATRIMONIO_PATTERNS: Array<{ re: RegExp; rubro: string }> = [
  { re: /atribuible a la participaci[oó]n controlante/i, rubro: "3.3" },
  {
    re: /participaci[oó]n no controlante|inter[eé]s no controlante|inter[eé]s no controlador/i,
    rubro: "3.4",
  },
  {
    re: /ganancias\s*(\([^)]*\)\s*)?acumuladas|ganancias reservadas|utilidades retenidas|resultados no asignados/i,
    rubro: "3.2",
  },
  { re: /^reservas$/i, rubro: "3.2" },
  {
    re: /acciones en circulaci[oó]n|acciones propias|capital social|prima de negociaci[oó]n/i,
    rubro: "3.1",
  },
  { re: /otros conceptos dentro del patrimonio/i, rubro: "3.9" },
  { re: /^total del patrimonio$/i, rubro: "3.3" },
  { re: /^capital y otras cuentas de capital/i, rubro: "3.1" },
];

const PASIVO_PATTERNS: Array<{ re: RegExp; rubro: string }> = [
  { re: /acreedores por operaciones/i, rubro: "2.2.08" },
  { re: /deudas por operaciones a plazo/i, rubro: "2.1.09" },
  { re: /garant[ií]as en efectivo recibidas de agentes/i, rubro: "2.2.08" },
  { re: /saldos de agentes en cuentas de liquidaci[oó]n/i, rubro: "2.2.08" },
  { re: /^pr[eé]stamos$/i, rubro: "2.1.08" },
  { re: /^cuentas por pagar$/i, rubro: "2.2.09" },
  { re: /^anticipos de clientes/i, rubro: "2.1.02" },
  { re: /^remuneraciones y cargas sociales/i, rubro: "2.2.05" },
  { re: /^sueldos y cargas sociales/i, rubro: "2.2.05" },
  { re: /^impuestos por pagar/i, rubro: "2.2.04" },
  { re: /^deudas por arrendamiento/i, rubro: "2.1.07" },
  { re: /^otras deudas$/i, rubro: "2.1.09" },
  { re: /^provisiones$/i, rubro: "2.2.01" },
  { re: /pasivo por impuesto diferido/i, rubro: "2.1.03" },
];

const ACTIVO_PATTERNS: Array<{ re: RegExp; rubro: string }> = [
  { re: /inversiones en asociadas/i, rubro: "1.1.04" },
  { re: /activos intangibles/i, rubro: "1.1.01" },
  { re: /^plusval[ií]a$/i, rubro: "1.1.01" },
  { re: /propiedades de inversi[oó]n/i, rubro: "1.1.02" },
  { re: /propiedad,?\s+planta y equipos/i, rubro: "1.1.02" },
  { re: /otros activos financieros/i, rubro: "1.1.08" },
  { re: /cr[eé]ditos por operaciones a plazo/i, rubro: "1.2.03" },
  { re: /cr[eé]ditos por servicios/i, rubro: "1.2.03" },
  { re: /^cuentas comerciales por cobrar/i, rubro: "1.2.03" },
  { re: /efectivo y equivalentes(?! al)/i, rubro: "1.2.01" },
  { re: /^caja y bancos$/i, rubro: "1.2.01" },
  { re: /otros cr[eé]ditos(?! por)/i, rubro: "1.2.04" },
  { re: /^otros cr[eé]ditos$/i, rubro: "1.2.04" },
  { re: /^inventarios$/i, rubro: "1.2.05" },
  { re: /^inversiones$/i, rubro: "1.2.02" },
  { re: /^derecho a uso de activos/i, rubro: "1.1.03" },
  { re: /^otros activos$/i, rubro: "1.9" },
];

const RUBRO_PATTERN_GROUPS = [
  { patterns: ACTIVO_PATTERNS, label: "Activo" },
  { patterns: PATRIMONIO_PATTERNS, label: "Patrimonio" },
  { patterns: PASIVO_PATTERNS, label: "Pasivo" },
] as const;

/** Sugiere código de rubro institucional a partir de la denominación del balance. */
export function sugerirRubroCodigoBalance(denominacion: string): string | null {
  for (const { patterns } of RUBRO_PATTERN_GROUPS) {
    for (const { re, rubro } of patterns) {
      if (re.test(denominacion)) return rubro;
    }
  }
  return null;
}

function lineaSinFlagManual<T extends LineaBalanceLike>(l: T): T {
  return { ...l, excluirDeCuadratura: false };
}

function ordenarAcciones(acciones: AccionReconciliacion[]): AccionReconciliacion[] {
  return [...acciones].sort(
    (a, b) => (PRIORIDAD_ACCION[a.tipo] ?? 99) - (PRIORIDAD_ACCION[b.tipo] ?? 99)
  );
}

function planificarReclasificacionRubro(
  lineas: Array<
    LineaBalanceLike & {
      id: string;
      rubroInstitucionalId?: string;
      rubroCodigo?: string;
      paginaNumero?: number;
    }
  >,
  rubros: RubroBalanceLike[],
  paginas?: number[]
): AccionReconciliacion[] {
  const byCodigo = new Map(rubros.map((r) => [r.codigo, r]));
  const acciones: AccionReconciliacion[] = [];

  for (const l of lineas) {
    if (paginas?.length && l.paginaNumero && !paginas.includes(l.paginaNumero)) continue;

    for (const { patterns, label } of RUBRO_PATTERN_GROUPS) {
      for (const { re, rubro } of patterns) {
        if (!re.test(l.denominacionOriginal)) continue;
        const destino = rubro;
        if (l.rubroCodigo === destino) break;
        const efDest = byCodigo.get(destino)?.estadoFinanciero;
        const efActual = l.rubroCodigo ? byCodigo.get(l.rubroCodigo)?.estadoFinanciero : undefined;
        if (efDest && efActual === efDest && l.rubroCodigo?.startsWith(destino.split(".")[0] + ".")) break;
        if (!byCodigo.has(destino)) continue;
        acciones.push({
          tipo: "reclasificar_rubro",
          lineaId: l.id,
          rubroCodigoDestino: destino,
          descripcion: `${label} → ${destino}: ${l.denominacionOriginal.slice(0, 45)}`,
        });
        break;
      }
    }
  }
  return acciones;
}

/** Restaura líneas del balance objetivo excluidas por error tras reclasificación. */
export function planificarRecuperacionBalance(
  lineas: Array<
    LineaBalanceLike & {
      id: string;
      rubroInstitucionalId?: string;
      rubroCodigo?: string;
      paginaNumero?: number;
    }
  >,
  rubros: RubroBalanceLike[],
  paginasObjetivo: number[]
): AccionReconciliacion[] {
  const byCodigo = new Map(rubros.map((r) => [r.codigo, r]));
  const acciones: AccionReconciliacion[] = [];

  for (const l of lineas) {
    if (!l.paginaNumero || !paginasObjetivo.includes(l.paginaNumero)) continue;
    if (!l.excluirDeCuadratura) continue;

    const rubro = l.rubroCodigo ? byCodigo.get(l.rubroCodigo) : undefined;
    const motivo = motivoExclusionCuadratura(lineaSinFlagManual(l), rubro);
    if (motivo !== null) continue;

    acciones.push({
      tipo: "incluir_cuadratura",
      lineaId: l.id,
      descripcion: `Incluir en cuadratura: ${l.denominacionOriginal.slice(0, 50)}`,
    });
  }
  return acciones;
}

export function planificarReconciliacion(
  lineas: Array<
    LineaBalanceLike & {
      id: string;
      rubroInstitucionalId?: string;
      rubroCodigo?: string;
      paginaNumero?: number;
    }
  >,
  rubros: RubroBalanceLike[],
  paginasObjetivo?: number[]
): AccionReconciliacion[] {
  const analisis = analizarBalance(lineas, rubros, paginasObjetivo);
  const paginas = analisis.paginasBalanceObjetivo;
  const byCodigo = new Map(rubros.map((r) => [r.codigo, r]));
  const acciones: AccionReconciliacion[] = [];

  acciones.push(...planificarReclasificacionRubro(lineas, rubros, paginas));
  acciones.push(...planificarRecuperacionBalance(lineas, rubros, paginas));

  for (const l of lineas) {
    const rubro = l.rubroCodigo ? byCodigo.get(l.rubroCodigo) : undefined;
    const motivo = motivoExclusionCuadratura(lineaSinFlagManual(l), rubro);
    const enBalance = Boolean(l.paginaNumero && paginas.includes(l.paginaNumero));

    if (motivo && motivo !== "sin_rubro") {
      if (enBalance && motivo === "agrupador") continue;
      acciones.push({
        tipo: "excluir_cuadratura",
        lineaId: l.id,
        descripcion: `Excluir de cuadratura (${motivo}): ${l.denominacionOriginal.slice(0, 50)}`,
      });
      continue;
    }

    if (
      paginas.length &&
      l.paginaNumero &&
      !paginas.includes(l.paginaNumero) &&
      !esLineaFilaTotalBalance(l)
    ) {
      acciones.push({
        tipo: "excluir_cuadratura",
        lineaId: l.id,
        descripcion: `Excluir (otro estado financiero, pág. ${l.paginaNumero}): ${l.denominacionOriginal.slice(0, 40)}`,
      });
    }
  }

  const byDenom = new Map<string, typeof lineas>();
  for (const l of lineas) {
    const k = normDenom(l.denominacionOriginal).replace(/\s+\d{1,3}$/, "");
    const g = byDenom.get(k) ?? [];
    g.push(l);
    byDenom.set(k, g);
  }
  for (const grupo of byDenom.values()) {
    if (grupo.length < 2) continue;
    const sorted = [...grupo].sort(
      (a, b) => Math.abs(montoLineaBalance(b)) - Math.abs(montoLineaBalance(a))
    );
    const mayor = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      const menor = sorted[i]!;
      const ratio = Math.abs(montoLineaBalance(mayor)) / Math.abs(montoLineaBalance(menor));
      if (ratio >= 900 && ratio <= 1100) {
        acciones.push({
          tipo: "eliminar_escala",
          lineaId: menor.id,
          descripcion: `Eliminar duplicado escala ×1000: ${menor.denominacionOriginal.slice(0, 45)}`,
        });
      }
    }
  }

  /** Misma pág. balance + rubro: eliminar fila ×1000 aunque el concepto difiera levemente. */
  const porPagRubro = new Map<string, typeof lineas>();
  for (const l of lineas) {
    if (!l.paginaNumero || !paginas.includes(l.paginaNumero) || !l.rubroCodigo) continue;
    const k = `${l.paginaNumero}:${l.rubroCodigo}`;
    const g = porPagRubro.get(k) ?? [];
    g.push(l);
    porPagRubro.set(k, g);
  }
  for (const grupo of porPagRubro.values()) {
    if (grupo.length < 2) continue;
    const sorted = [...grupo].sort(
      (a, b) => Math.abs(montoLineaBalance(b)) - Math.abs(montoLineaBalance(a))
    );
    const mayor = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      const menor = sorted[i]!;
      const mMayor = Math.abs(montoLineaBalance(mayor));
      const mMenor = Math.abs(montoLineaBalance(menor));
      if (mMenor === 0) continue;
      const ratio = mMayor / mMenor;
      if (ratio >= 900 && ratio <= 1100) {
        acciones.push({
          tipo: "eliminar_escala",
          lineaId: menor.id,
          descripcion: `Eliminar escala ×1000 (pág./rubro): ${menor.denominacionOriginal.slice(0, 40)}`,
        });
      }
    }
  }

  return ordenarAcciones(acciones);
}
