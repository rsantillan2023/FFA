import mongoose from "mongoose";
import { config } from "dotenv";

config();

const numero = "FFA-2026-00016";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";
await mongoose.connect(uri);
const db = mongoose.connection.db;

const caso = await db.collection("casos").findOne({ numero });
if (!caso) {
  console.log("No encontrado");
  process.exit(1);
}

const lineas = await db
  .collection("lineacontables")
  .find({ casoId: caso._id })
  .sort({ paginaNumero: 1, denominacionOriginal: 1 })
  .toArray();
const doc = await db.collection("documentofuentes").findOne({ casoId: caso._id });

console.log("=== CASO ===", caso.numero, caso.referencia, caso.moneda, caso.escala);
console.log("=== PROVENANCE ===");
console.log(JSON.stringify(doc?.extractPayload?.provenanceExtraccion, null, 2));

const incl = lineas.filter((l) => !l.excluirDeCuadratura && l.rubroCodigo);

console.log("\n=== DUPLICADOS (mismo rubro+página, 2+ líneas) ===");
const byKey = new Map();
for (const l of incl) {
  const k = `${l.rubroCodigo}|p${l.paginaNumero}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(l);
}
let dupMonto = 0;
for (const [k, arr] of byKey) {
  if (arr.length > 1) {
    console.log(
      k,
      arr.map((l) => ({
        d: l.denominacionOriginal?.slice(0, 55),
        m: l.montoNormalizado ?? l.montoOriginal,
      }))
    );
    const montos = arr.map((l) => l.montoNormalizado ?? l.montoOriginal ?? 0).sort((a, b) => b - a);
    dupMonto += montos.slice(1).reduce((s, m) => s + Math.abs(m), 0);
  }
}
console.log("Monto extra estimado por duplicados (2da+ copia):", dupMonto);

console.log("\n=== ER / PÁG 3 (contaminación balance) ===");
for (const l of lineas.filter(
  (l) =>
    l.paginaNumero === 3 ||
    /ganancia|resultado|ingreso|costo|gasto|impuesto a las ganancias/i.test(l.denominacionOriginal || "")
)) {
  console.log(
    `p${l.paginaNumero}`,
    l.rubroCodigo ?? "—",
    l.excluirDeCuadratura ? "EXCL" : "INCL",
    l.montoNormalizado ?? l.montoOriginal,
    l.denominacionOriginal?.slice(0, 58)
  );
}

console.log("\n=== SIN RUBRO (11) ===");
for (const l of lineas.filter((l) => !l.rubroInstitucionalId && !l.rubroCodigo)) {
  console.log(
    `p${l.paginaNumero}`,
    "rev=" + l.requiereRevision,
    "conf=" + l.confianzaClasificacion,
    l.montoNormalizado ?? l.montoOriginal,
    l.denominacionOriginal?.slice(0, 55)
  );
}

const totalAct = lineas.find((l) => /^TOTAL ACTIVOS$/i.test((l.denominacionOriginal || "").trim()));
const totalPP = lineas.find((l) => /TOTAL DE PATRIMONIO Y PASIVOS/i.test(l.denominacionOriginal || ""));
const actDet = incl.filter((l) => l.rubroCodigo?.startsWith("1."));
const pasDet = incl.filter((l) => l.rubroCodigo?.startsWith("2."));
const patDet = incl.filter((l) => l.rubroCodigo?.startsWith("3."));

const sum = (arr) => arr.reduce((s, l) => s + (l.montoNormalizado ?? l.montoOriginal ?? 0), 0);

console.log("\n=== CUADRATURA ===");
console.log("TOTAL ACTIVOS PDF:", totalAct?.montoNormalizado ?? totalAct?.montoOriginal);
console.log("Suma detalle activo:", sum(actDet));
console.log(
  "Exceso activo vs PDF:",
  sum(actDet) - (totalAct?.montoNormalizado ?? totalAct?.montoOriginal ?? 0)
);
console.log("TOTAL P+P PDF:", totalPP?.montoNormalizado ?? totalPP?.montoOriginal);
console.log("Suma pasivo:", sum(pasDet));
console.log("Suma patrimonio:", sum(patDet));
console.log("Pasivo+Patrimonio:", sum(pasDet) + sum(patDet));
console.log(
  "Diff activo vs (P+P):",
  sum(actDet) - (sum(pasDet) + sum(patDet))
);
console.log(
  "Pct diff / activo:",
  (
    ((sum(actDet) - (sum(pasDet) + sum(patDet))) / sum(actDet)) *
    100
  ).toFixed(1) + "%"
);

console.log("\n=== LÍNEAS CON RUIDO (número al final denominación) ===");
for (const l of lineas.filter((l) => /\s\d{1,2}$/.test(l.denominacionOriginal || ""))) {
  console.log(
    `p${l.paginaNumero}`,
    l.rubroCodigo ?? "—",
    l.excluirDeCuadratura ? "EXCL" : "INCL",
    l.montoNormalizado ?? l.montoOriginal,
    l.denominacionOriginal
  );
}

await mongoose.disconnect();
