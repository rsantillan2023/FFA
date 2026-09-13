import assert from "node:assert/strict";
import { parseMontoLocale } from "../dist/extract/parse-monto-locale.js";
import { detectarInconsistencias } from "../dist/extract/cross-validate-extract.js";
import { ejecutarControlesAritmeticos } from "../dist/extract/extract-arithmetic-checks.js";
import { clasificarItemsExtract } from "../dist/extract/classify-extract-items.js";
import { crossValidateAndDedupe } from "../dist/extract/dedupe-extract.js";
import { normalizarConfianzaExtraccion } from "../dist/extract/normalize-confianza.js";
import { selectPagesForExtraction } from "../dist/extract/pdf-page-select.js";
import { enriquecerMonedaEscala } from "../dist/extract/detect-moneda-escala.js";

// Normalización locale
assert.equal(parseMontoLocale("31.416", { moneda: "ARS", escala: "millones" }).montoNormalizado, 31416);
assert.equal(parseMontoLocale("31416", { moneda: "ARS" }).montoNormalizado, 31416);
assert.equal(parseMontoLocale("19,7", { moneda: "ARS" }).montoNormalizado, 19.7);
assert.equal(parseMontoLocale("1.234,56", { moneda: "ARS" }).montoNormalizado, 1234.56);

// Período distinto ≠ inconsistencia
const periodoTest = detectarInconsistencias([
  { denominacionOriginal: "Ganancia neta", montoOriginal: 22821, montoNormalizado: 22821, paginaNumero: 12, columnaOrigen: "2025", seccionPagina: "resultados" },
  { denominacionOriginal: "Ganancia neta", montoOriginal: 20000, montoNormalizado: 20000, paginaNumero: 12, columnaOrigen: "2024", seccionPagina: "resultados" },
]);
assert.equal(periodoTest.inconsistencias.length, 0);

// Resultado bruto con signo
const ctrlBruto = ejecutarControlesAritmeticos([
  { denominacionOriginal: "Ventas", montoOriginal: 225233, montoNormalizado: 225233, paginaNumero: 1, seccionPagina: "resultados", id: "Ventas" },
  { denominacionOriginal: "Costo de ventas", montoOriginal: -172284, montoNormalizado: -172284, paginaNumero: 1, seccionPagina: "resultados", id: "Costo" },
  { denominacionOriginal: "Ganancia bruta", montoOriginal: 52949, montoNormalizado: 52949, paginaNumero: 1, seccionPagina: "resultados", id: "Bruto" },
]);
assert.equal(ctrlBruto.find((c) => c.id === "resultado_bruto")?.passed, true);

// Confianza 0-1
assert.equal(normalizarConfianzaExtraccion(95), 0.95);
assert.equal(normalizarConfianzaExtraccion(0.85), 0.85);

// Clasificación operativo vs contable
const clasif = clasificarItemsExtract([
  { denominacionOriginal: "Cemento, cemento de albañilería", montoOriginal: 1.29, paginaNumero: 3, fuentePrioridad: "operativo" },
  { denominacionOriginal: "Total del activo", montoOriginal: 1000, paginaNumero: 12, fuentePrioridad: "canonico", seccionPagina: "balance" },
  { denominacionOriginal: "EBITDA Ajustado", montoOriginal: 50147, paginaNumero: 2, fuentePrioridad: "resumen", seccionPagina: "resumen_ejecutivo" },
]);
assert.equal(clasif.lineasContables.length, 1);
assert.equal(clasif.indicadoresOperativos.length, 1);
assert.equal(clasif.indicadoresFinancieros.length, 1);

// Dedupe canónico vs resumen (misma página)
const dedupe = crossValidateAndDedupe([
  { denominacionOriginal: "Ganancia neta", montoOriginal: 22821, paginaNumero: 12, fuentePrioridad: "canonico", seccionPagina: "resultados", columnaOrigen: "2025" },
  { denominacionOriginal: "Ganancia neta", montoOriginal: 22281, paginaNumero: 12, fuentePrioridad: "resumen", seccionPagina: "resumen_ejecutivo", columnaOrigen: "2025" },
]);
assert.equal(dedupe.lineas.length, 1);
assert.equal(dedupe.lineas[0].montoOriginal, 22821);

// Distinta página → no colapsar (p4 resumen vs p12 canónico)
const dedupePaginas = crossValidateAndDedupe([
  { denominacionOriginal: "Ganancia neta", montoOriginal: 22821, paginaNumero: 12, fuentePrioridad: "canonico", seccionPagina: "resultados", columnaOrigen: "2025" },
  { denominacionOriginal: "Ganancia neta", montoOriginal: 22821, paginaNumero: 4, fuentePrioridad: "canonico", seccionPagina: "resultados", columnaOrigen: "2025" },
]);
assert.equal(dedupePaginas.lineas.length, 2);

// Inconsistencias
const inc = detectarInconsistencias([
  { denominacionOriginal: "Ganancia bruta", montoOriginal: 52949, paginaNumero: 14, fuentePrioridad: "canonico" },
  { denominacionOriginal: "Ganancia bruta", montoOriginal: 52449, paginaNumero: 3, fuentePrioridad: "resumen" },
]);
assert.equal(inc.inconsistencias.length, 1);

// Moneda ARS
const meta = enriquecerMonedaEscala(
  { escala: "millones" },
  [{ pagina: 10, texto: "Estado de Situación Financiera Consolidado expresado en millones de pesos argentinos" }]
);
assert.equal(meta.moneda, "ARS");
assert.equal(meta.escalaFactor, 1_000_000);

// Priorización: estados canónicos obligatorios aunque maxPages=3
const sel = selectPagesForExtraction(
  [
    { pageNum: 1, text: "resumen ejecutivo highlights", seccion: "resumen_ejecutivo", score: 2 },
    { pageNum: 2, text: "indicadores ganancia neta activo corriente", seccion: "balance", score: 8 },
    { pageNum: 3, text: "tabla operativa", seccion: "operativo", score: 20 },
    { pageNum: 4, text: "más resumen", seccion: "resumen_ejecutivo", score: 15 },
    { pageNum: 5, text: "comentarios", seccion: "otro", score: 12 },
    { pageNum: 6, text: "narrativa", seccion: "otro", score: 10 },
    { pageNum: 11, text: "Estado de Situación Financiera Consolidado total del activo", seccion: "balance", score: 53, tituloCanonico: true },
    { pageNum: 12, text: "Estado de Resultados ganancia neta", seccion: "resultados", score: 93, tituloCanonico: true },
    { pageNum: 13, text: "Estado de Flujo de Efectivo actividades operativas", seccion: "flujo_efectivo", score: 85, tituloCanonico: true },
  ],
  3
);
assert.ok(sel.pageNums.includes(11), "balance p11 obligatorio");
assert.ok(sel.pageNums.includes(12), "resultados p12 obligatorio");
assert.ok(sel.pageNums.includes(13), "flujo p13 obligatorio");
assert.equal(
  sel.clasificadas.find((p) => p.pagina === 11)?.incluida,
  true,
  "p11 incluida=true"
);

console.log("OK — test-extract-post-process");
