/**
 * Carga / corrige líneas del balance desde el PDF testigo (pág. 76).
 * node scripts/cargar-lineas-balance-pdf.mjs [FFA-2026-00011]
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00011";
const PDF_PATH = "C:/Users/lenovo/Downloads/MEMORIA-2024-EEFF.pdf";
const PAGINA = 76;

try {
  readFileSync(resolve(__dirname, "../.env"), "utf8")
    .split("\n")
    .forEach((l) => {
      const m = l.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
} catch {
  /* ignore */
}

const { parseMontoChileno, normalizarDenominacion } = await import(
  "../packages/pipeline/dist/index.js"
);
const { CasoModel, LineaContableModel, RubroInstitucionalModel, DocumentoFuenteModel } =
  await import("../packages/db/dist/index.js");

/** Líneas oficiales 31/12/2024 — cifras en miles ×1000 para almacenamiento. */
const LINEAS_PDF = [
  // Activo corriente
  { denom: "Efectivo y equivalentes", nota: "17", rubro: "1.2.01", miles: "595.789.640" },
  { denom: "Otros activos financieros", nota: "18 y 36", rubro: "1.2.02", miles: "491.343.433", corriente: true },
  { denom: "Créditos por operaciones a plazo a liquidar", nota: "19", rubro: "1.2.03", miles: "328.643.950" },
  { denom: "Créditos por servicios", nota: "20", rubro: "1.2.03", miles: "6.277.474" },
  { denom: "Otros créditos", nota: "21", rubro: "1.2.04", miles: "10.148.696", corriente: true },
  // Activo no corriente
  { denom: "Otros activos financieros", nota: "18 y 36", rubro: "1.1.08", miles: "97.167.611", corriente: false },
  { denom: "Inversiones en asociadas", nota: "22", rubro: "1.1.04", miles: "11.666.518" },
  { denom: "Propiedad, planta y equipos", nota: "23", rubro: "1.1.02", miles: "18.617.893" },
  { denom: "Activos Intangibles", nota: "24", rubro: "1.1.01", miles: "93.414.064" },
  { denom: "Propiedades de inversión", nota: "25", rubro: "1.1.02", miles: "3.847.958", propiedadInv: true },
  { denom: "Otros créditos", nota: "21", rubro: "1.1.06", miles: "381.598", corriente: false },
  // Pasivo corriente
  { denom: "Acreedores por operaciones", nota: "26", rubro: "2.2.08", miles: "537.789.382" },
  { denom: "Deudas por operaciones a plazo a liquidar", nota: "27", rubro: "2.1.09", miles: "328.643.950", pasivo: true },
  { denom: "Saldos de agentes en cuentas de liquidación", nota: "28", rubro: "2.2.08", miles: "67.364.127" },
  { denom: "Garantías en efectivo recibidas de agentes", nota: "29", rubro: "2.2.08", miles: "94.653.644" },
  { denom: "Cuentas por pagar", nota: "30", rubro: "2.2.09", miles: "1.739.753" },
  { denom: "Remuneraciones y cargas sociales a pagar", nota: "31", rubro: "2.2.05", miles: "1.716.753" },
  { denom: "Deudas fiscales", nota: "32", rubro: "2.2.04", miles: "35.027.265" },
  { denom: "Otros pasivos", nota: "33", rubro: "2.1.09", miles: "25.602.532", pasivoOtros: true },
  // Pasivo no corriente
  { denom: "Pasivo por impuesto diferido", nota: "16", rubro: "2.1.03", miles: "20.726.230" },
  { denom: "Previsiones", nota: "34", rubro: "2.1.01", miles: "743.500" },
  // Patrimonio
  { denom: "Acciones en circulación", rubro: "3.1", miles: "10.072.283" },
  { denom: "Acciones propias en cartera", rubro: "3.1", miles: "(19.913)" },
  { denom: "Prima de negociación de acciones propias", rubro: "3.1", miles: "(2.029.952)" },
  { denom: "Ganancias reservadas", rubro: "3.2", miles: "348.449.833" },
  { denom: "Resultados no asignados", rubro: "3.2", miles: "(24.965.978)" },
  { denom: "Otros conceptos dentro del patrimonio", rubro: "3.9", miles: "211.715.299" },
  { denom: "Interés no controlante", rubro: "3.4", miles: "70.127", interesNC: true },
  {
    denom: "Atribuible a la participación controlante",
    rubro: "3.3",
    miles: "543.221.572",
    excluirCuadratura: true,
  },
  {
    denom: "Atribuible a la participación no controlante",
    rubro: "3.4",
    miles: "70.127",
    noControlante: true,
    excluirCuadratura: true,
  },
];

function normKey(s) {
  return normalizarDenominacion(s)
    .replace(/\b(activo|pasivo|patrimonio)\s+(no\s+)?corriente\b/g, "")
    .replace(/\bsegun estado respectivo\b/g, "")
    .replace(/\s+\d{1,3}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function montoDesdeMiles(milesStr) {
  return parseMontoChileno(milesStr) * 1000;
}

function denomCompleta(item) {
  const nota = item.nota ? ` ${item.nota}` : "";
  return `${item.denom}${nota}`.trim();
}

function matchLinea(lineas, item) {
  const key = normKey(item.denom);
  const candidatos = lineas.filter((l) => {
    if (l.paginaNumero !== PAGINA && l.paginaNumero !== PAGINA - 1 && l.paginaNumero !== PAGINA + 1) {
      return false;
    }
    const lk = normKey(l.denominacionOriginal);
    if (!lk.includes(key) && !key.includes(lk.slice(0, Math.min(20, lk.length)))) return false;
    if (item.propiedadInv && !/inversi[oó]n/.test(lk)) return false;
    if (item.propiedadInv === false && /inversi[oó]n/.test(lk) && /propiedad/.test(key)) return false;
    if (item.corriente === true && l.rubroCodigo?.startsWith("1.1.")) return false;
    if (item.corriente === false && l.rubroCodigo?.startsWith("1.2.")) return false;
    if (item.pasivo && item.denom.includes("Deudas por operaciones") && !/deuda/.test(lk)) return false;
    if (item.pasivoOtros && !/otros pasivos/.test(lk)) return false;
    if (item.noControlante && !/no controlante/.test(lk)) return false;
    if (!item.noControlante && item.denom.includes("no controlante") && /no controlante/.test(lk)) return false;
    if (item.interesNC && !/^inter[eé]s no controlante/i.test(l.denominacionOriginal.trim())) return false;
    if (item.interesNC && /atribuible|controlante/.test(lk)) return false;
    if (item.denom === "Interés no controlante" && /no controlante/.test(lk) && !item.interesNC) return false;
    if (item.denom.includes("controlante") && item.denom.includes("Atribuible") && !/atribuible/.test(lk)) return false;
    return true;
  });

  candidatos.sort((a, b) => {
    const da = Math.abs(Math.abs(a.montoNormalizado ?? a.montoOriginal) - montoDesdeMiles(item.miles));
    const db = Math.abs(Math.abs(b.montoNormalizado ?? b.montoOriginal) - montoDesdeMiles(item.miles));
    return da - db;
  });
  return candidatos[0] ?? null;
}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");

const caso = await CasoModel.findOne({ numero });
if (!caso) {
  console.error("Caso no encontrado:", numero);
  process.exit(1);
}

const doc = await DocumentoFuenteModel.findOne({ casoId: caso._id }).sort({ createdAt: 1 });
if (!doc) {
  console.error("Sin documento fuente");
  process.exit(1);
}

const rubros = await RubroInstitucionalModel.find({
  planCuentasVersionId: caso.planCuentasVersionId,
  activo: true,
});
const rubroByCodigo = new Map(rubros.map((r) => [r.codigo, r]));

// Asegurar 1.1.06 si falta (otros créditos NC)
if (!rubroByCodigo.has("1.1.06")) {
  const padre = rubroByCodigo.get("1.1");
  const creado = await RubroInstitucionalModel.create({
    planCuentasVersionId: caso.planCuentasVersionId,
    codigo: "1.1.06",
    nombre: "Otros créditos no corrientes",
    estadoFinanciero: "activo",
    convencionSigno: "normal",
    activo: true,
    orden: 8,
    padreId: padre?._id,
  });
  rubroByCodigo.set("1.1.06", creado);
}

const casoId = caso._id.toString();
let lineas = await LineaContableModel.find({ casoId: caso._id });

// Eliminar ajustes genéricos previos
const delAjustes = await LineaContableModel.deleteMany({
  casoId: caso._id,
  denominacionOriginal: {
    $in: [
      "Ajuste de cuadratura (reconciliación automática)",
      "Ajuste imputación genérica activo (testigo PDF)",
      "Ajuste imputación genérica patrimonio (testigo PDF)",
    ],
  },
});
console.log("Ajustes genéricos eliminados:", delAjustes.deletedCount);

let creadas = 0;
let actualizadas = 0;

for (const item of LINEAS_PDF) {
  const rubro = rubroByCodigo.get(item.rubro);
  if (!rubro) {
    console.warn("Rubro no encontrado:", item.rubro, item.denom);
    continue;
  }

  const monto = montoDesdeMiles(item.miles);
  const denominacionOriginal = denomCompleta(item);
  const existente = matchLinea(lineas, item);

  const excluir = item.excluirCuadratura === true;

  if (existente) {
    await LineaContableModel.updateOne(
      { _id: existente._id },
      {
        denominacionOriginal,
        denominacionNormalizada: normalizarDenominacion(denominacionOriginal),
        montoOriginal: monto,
        montoNormalizado: monto,
        rubroInstitucionalId: rubro._id,
        rubroCodigo: rubro.codigo,
        clasificacionPropuesta: rubro._id,
        paginaNumero: PAGINA,
        excluirDeCuadratura: excluir,
        ...(excluir
          ? { motivoExclusionCuadratura: "total" }
          : { $unset: { motivoExclusionCuadratura: 1 } }),
        origenClasificacion: "manual",
        requiereRevision: false,
        estado: "clasificada",
      }
    );
    actualizadas++;
    console.log("✓ Actualizada:", item.rubro, monto.toLocaleString("es-AR"), denominacionOriginal);
  } else {
    await LineaContableModel.create({
      casoId: caso._id,
      documentoId: doc._id,
      paginaNumero: PAGINA,
      denominacionOriginal,
      denominacionNormalizada: normalizarDenominacion(denominacionOriginal),
      montoOriginal: monto,
      montoNormalizado: monto,
      rubroInstitucionalId: rubro._id,
      rubroCodigo: rubro.codigo,
      clasificacionPropuesta: rubro._id,
      confianzaClasificacion: 100,
      excluirDeCuadratura: excluir,
      motivoExclusionCuadratura: excluir ? "total" : undefined,
      origenClasificacion: "manual",
      requiereRevision: false,
      estado: "clasificada",
    });
    creadas++;
    console.log("+ Creada:", item.rubro, monto.toLocaleString("es-AR"), denominacionOriginal);
  }
}

lineas = await LineaContableModel.find({ casoId: caso._id });

async function forzarRubroPorDenom(regex, rubroCodigo) {
  const rubro = rubroByCodigo.get(rubroCodigo);
  if (!rubro) return;
  for (const l of await LineaContableModel.find({
    casoId: caso._id,
    paginaNumero: { $in: [PAGINA - 1, PAGINA, PAGINA + 1] },
    denominacionOriginal: regex,
  })) {
    await LineaContableModel.updateOne(
      { _id: l._id },
      {
        rubroInstitucionalId: rubro._id,
        rubroCodigo: rubro.codigo,
        clasificacionPropuesta: rubro._id,
        excluirDeCuadratura: false,
        $unset: { motivoExclusionCuadratura: 1 },
      }
    );
  }
}

await forzarRubroPorDenom(/garant[ií]as en efectivo/i, "2.2.08");
await forzarRubroPorDenom(/saldos de agentes en cuentas/i, "2.2.08");

// Subtotales patrimonio (no sumar con componentes)
await LineaContableModel.updateMany(
  {
    casoId: caso._id,
    paginaNumero: PAGINA,
    denominacionOriginal: /atribuible a la participaci/i,
  },
  { excluirDeCuadratura: true, motivoExclusionCuadratura: "total" }
);

// Un solo Interés no controlante (detalle patrimonio)
const rubro34 = rubroByCodigo.get("3.4");
const intereses = await LineaContableModel.find({
  casoId: caso._id,
  paginaNumero: PAGINA,
  denominacionOriginal: /^Inter[eé]s no controlante$/i,
}).sort({ _id: 1 });
for (let i = 1; i < intereses.length; i++) {
  await LineaContableModel.deleteOne({ _id: intereses[i]._id });
  console.log("− Duplicado Interés no controlante eliminado");
}
const interesExiste = intereses[0];
if (!interesExiste && rubro34) {
  await LineaContableModel.create({
    casoId: caso._id,
    documentoId: doc._id,
    paginaNumero: PAGINA,
    denominacionOriginal: "Interés no controlante",
    denominacionNormalizada: normalizarDenominacion("Interés no controlante"),
    montoOriginal: 70127000,
    montoNormalizado: 70127000,
    rubroInstitucionalId: rubro34._id,
    rubroCodigo: "3.4",
    clasificacionPropuesta: rubro34._id,
    excluirDeCuadratura: false,
    origenClasificacion: "manual",
    requiereRevision: false,
    estado: "clasificada",
    confianzaClasificacion: 100,
  });
  creadas++;
  console.log("+ Creada: 3.4 Interés no controlante (detalle patrimonio)");
}

lineas = await LineaContableModel.find({ casoId: caso._id });
const enBalance = lineas.filter((l) => l.paginaNumero >= 75 && l.paginaNumero <= 77);
const idsUsados = new Set();
for (const item of LINEAS_PDF) {
  const m = matchLinea(enBalance, item);
  if (m) idsUsados.add(m._id.toString());
}
for (const l of enBalance) {
  if (/^inter[eé]s no controlante$/i.test(l.denominacionOriginal.trim())) idsUsados.add(l._id.toString());
  if (/^total /i.test(l.denominacionOriginal)) idsUsados.add(l._id.toString());
}

let eliminadas = 0;
for (const l of enBalance) {
  if (idsUsados.has(l._id.toString())) continue;
  if (/Ajuste imputaci|Ajuste de cuadratura/i.test(l.denominacionOriginal)) continue;
  if (/^total /i.test(l.denominacionOriginal)) continue;
  await LineaContableModel.deleteOne({ _id: l._id });
  eliminadas++;
  console.log("− Eliminada duplicada/errónea:", l.rubroCodigo, l.denominacionOriginal.slice(0, 50));
}

console.log("\nResumen: creadas", creadas, "| actualizadas", actualizadas, "| eliminadas", eliminadas);

await mongoose.disconnect();

// Reconciliar sin ajustes genéricos si el detalle cuadra
const { reconciliarBalanceCaso } = await import("../packages/db/dist/services/balance-reconciliar.js");
await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const res = await reconciliarBalanceCaso(casoId, { crearAjuste: false });
console.log("\nPost-reconciliación:", res.mensaje);
console.log("Activo:", res.analisis.totales.activo);
console.log("P+PN:", res.analisis.totales.pasivo + res.analisis.totales.patrimonio);
console.log("Testigo:", res.analisis.testigoRecomendado?.totalActivo);
console.log("Detalle cuadratura:", res.analisis.conteos.detalle);
console.log("Ajuste creado:", res.ajusteCreado);

await mongoose.disconnect();
