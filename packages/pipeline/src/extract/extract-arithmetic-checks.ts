import type { ControlAritmeticoExtract, ExtractedLine, SeccionPagina } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";

function monto(linea: ExtractedLine): number {
  return linea.montoNormalizado ?? linea.montoOriginal;
}

function findLinea(
  lineas: ExtractedLine[],
  patterns: RegExp[],
  /** Si las líneas ya vienen filtradas por sección, omitir filtro adicional. */
  seccion?: SeccionPagina,
  preFiltradas = false
): ExtractedLine | undefined {
  for (const linea of lineas) {
    if (!preFiltradas && seccion && linea.seccionPagina && linea.seccionPagina !== seccion) continue;
    const d = normalizarDenominacion(linea.denominacionOriginal);
    if (patterns.some((p) => p.test(d))) return linea;
  }
  return undefined;
}

function sumaAlgebraica(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null || b == null) return undefined;
  return a + b;
}

function checkEquality(
  id: string,
  descripcion: string,
  obtenido: number | undefined,
  esperado: number | undefined,
  opts?: {
    paginaNumero?: number;
    seccionFinanciera?: ControlAritmeticoExtract["seccionFinanciera"];
    lineasInvolucradas?: string[];
  }
): ControlAritmeticoExtract | null {
  if (obtenido == null || esperado == null) return null;
  const tolerancia = Math.max(Math.abs(esperado), Math.abs(obtenido), 1) * 0.015;
  const diferencia = Math.abs(obtenido - esperado);
  const passed = diferencia <= tolerancia;
  return {
    id,
    descripcion,
    passed,
    esperado,
    obtenido,
    diferencia,
    tolerancia,
    paginaNumero: opts?.paginaNumero,
    seccionFinanciera: opts?.seccionFinanciera,
    lineasInvolucradas: opts?.lineasInvolucradas,
  };
}

function lineasBalance(lineas: ExtractedLine[]): ExtractedLine[] {
  return lineas.filter((l) => l.seccionPagina === "balance" || l.estadoFinancieroLinea === "activo" || l.estadoFinancieroLinea === "pasivo" || l.estadoFinancieroLinea === "patrimonio");
}

function sameContexto(a: ExtractedLine, b: ExtractedLine): boolean {
  if (a.paginaNumero !== b.paginaNumero) return false;
  const colA = a.columnaOrigen ?? a.periodo?.etiqueta ?? "";
  const colB = b.columnaOrigen ?? b.periodo?.etiqueta ?? "";
  if (colA && colB && colA !== colB) return false;
  return true;
}

/** Busca ventas/costo/bruto del mismo periodo y página que cierran aritméticamente. */
function findMejorTripletResultadoBruto(res: ExtractedLine[]): {
  ventasL: ExtractedLine;
  costoL: ExtractedLine;
  brutoL: ExtractedLine;
} | null {
  const ventasList = res.filter((l) =>
    [/ingresos por ventas/, /ventas netas/, /ingresos ordinarios/, /^ventas$/].some((p) =>
      p.test(normalizarDenominacion(l.denominacionOriginal))
    )
  );
  const costoList = res.filter((l) =>
    [/costo de ventas/, /costo de los ingresos/].some((p) =>
      p.test(normalizarDenominacion(l.denominacionOriginal))
    )
  );
  const brutoList = res.filter((l) =>
    [/ganancia bruta/, /resultado bruto/, /utilidad bruta/].some((p) =>
      p.test(normalizarDenominacion(l.denominacionOriginal))
    )
  );

  let best: { ventasL: ExtractedLine; costoL: ExtractedLine; brutoL: ExtractedLine } | null = null;
  let minDiff = Infinity;

  for (const ventasL of ventasList) {
    for (const costoL of costoList) {
      if (!sameContexto(ventasL, costoL)) continue;
      for (const brutoL of brutoList) {
        if (!sameContexto(ventasL, brutoL)) continue;
        const esperado = monto(ventasL) + monto(costoL);
        const diff = Math.abs(monto(brutoL) - esperado);
        if (diff < minDiff) {
          minDiff = diff;
          best = { ventasL, costoL, brutoL };
        }
      }
    }
  }

  return best;
}

function lineasResultados(lineas: ExtractedLine[]): ExtractedLine[] {
  const res = lineas.filter((l) => l.seccionPagina === "resultados" || l.estadoFinancieroLinea === "resultados");
  const canon = res.filter((l) => l.fuentePrioridad === "canonico" || l.metodoExtraccion === "heuristica");
  if (canon.length >= 3) return canon;
  return res;
}

/** Controles aritméticos con convención de signos y alcance por sección. */
export function ejecutarControlesAritmeticos(lineas: ExtractedLine[]): ControlAritmeticoExtract[] {
  const controles: ControlAritmeticoExtract[] = [];
  const bal = lineasBalance(lineas);
  const res = lineasResultados(lineas);

  const balScope = bal.length ? bal : lineas;
  const balPre = bal.length > 0;
  const totalActivoL = findLinea(
    balScope,
    [/activos totales/, /total del activo/, /^total activo$/, /total activo y pasivo/],
    "balance",
    balPre
  );
  const activoCorrienteL = findLinea(
    balScope,
    [/activo corriente/, /total activo corriente/, /^activos corrientes$/],
    "balance",
    balPre
  );
  const activoNoCorrienteL = findLinea(
    balScope,
    [/activo no corriente/, /total activo no corriente/, /^activos no corrientes$/],
    "balance",
    balPre
  );

  const totalActivo = totalActivoL ? monto(totalActivoL) : undefined;
  const activoCorriente = activoCorrienteL ? monto(activoCorrienteL) : undefined;
  const activoNoCorriente = activoNoCorrienteL ? monto(activoNoCorrienteL) : undefined;

  const c1 = checkEquality(
    "activo_corriente_no_corriente",
    "Activo total ≈ Activo corriente + Activo no corriente",
    totalActivo,
    sumaAlgebraica(activoCorriente, activoNoCorriente),
    {
      seccionFinanciera: "balance",
      lineasInvolucradas: [totalActivoL, activoCorrienteL, activoNoCorrienteL].filter(Boolean).map((l) => l!.id ?? l!.denominacionOriginal),
    }
  );
  if (c1) controles.push(c1);

  const totalPasivoL = findLinea(
    balScope,
    [/pasivos totales/, /total del pasivo/, /^total pasivo$/, /pasivo total/],
    "balance",
    balPre
  );
  const pasivoCorrienteL = findLinea(
    balScope,
    [/pasivo corriente/, /total pasivo corriente/, /^pasivos corrientes$/],
    "balance",
    balPre
  );
  const pasivoNoCorrienteL = findLinea(
    balScope,
    [/pasivo no corriente/, /total pasivo no corriente/, /^pasivos no corrientes$/],
    "balance",
    balPre
  );
  const patrimonioL = findLinea(
    balScope,
    [/patrimonio neto/, /patrimonio total/, /total patrimonio/, /^patrimonio$/],
    "balance",
    balPre
  );

  const totalPasivo = totalPasivoL ? monto(totalPasivoL) : undefined;
  const pasivoCorriente = pasivoCorrienteL ? monto(pasivoCorrienteL) : undefined;
  const pasivoNoCorriente = pasivoNoCorrienteL ? monto(pasivoNoCorrienteL) : undefined;
  const patrimonio = patrimonioL ? monto(patrimonioL) : undefined;

  const c2 = checkEquality(
    "pasivo_corriente_no_corriente",
    "Pasivo total ≈ Pasivo corriente + Pasivo no corriente",
    totalPasivo,
    sumaAlgebraica(pasivoCorriente, pasivoNoCorriente),
    {
      seccionFinanciera: "balance",
      lineasInvolucradas: [totalPasivoL, pasivoCorrienteL, pasivoNoCorrienteL].filter(Boolean).map((l) => l!.id ?? l!.denominacionOriginal),
    }
  );
  if (c2) controles.push(c2);

  const c3 = checkEquality(
    "ecuacion_contable",
    "Activo total ≈ Pasivo total + Patrimonio total",
    totalActivo,
    sumaAlgebraica(totalPasivo, patrimonio),
    {
      seccionFinanciera: "balance",
      lineasInvolucradas: [totalActivoL, totalPasivoL, patrimonioL].filter(Boolean).map((l) => l!.id ?? l!.denominacionOriginal),
    }
  );
  if (c3) controles.push(c3);

  const resScope = res.length ? res : lineas;
  const triplet = findMejorTripletResultadoBruto(resScope);
  const ventasL = triplet?.ventasL;
  const costoL = triplet?.costoL;
  const brutoL = triplet?.brutoL;

  const ventas = ventasL ? monto(ventasL) : undefined;
  const costo = costoL ? monto(costoL) : undefined;
  const bruto = brutoL ? monto(brutoL) : undefined;

  // Suma algebraica — respeta signo contable del costo (negativo → ventas + costo)
  const c4 = checkEquality(
    "resultado_bruto",
    "Ganancia bruta ≈ Ventas + Costo de ventas (signo contable)",
    bruto,
    sumaAlgebraica(ventas, costo),
    {
      seccionFinanciera: "resultados",
      lineasInvolucradas: [brutoL, ventasL, costoL].filter(Boolean).map((l) => l!.id ?? l!.denominacionOriginal),
    }
  );
  if (c4) controles.push(c4);

  return controles;
}
