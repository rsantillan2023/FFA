import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00014";

try {
  const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const { CasoModel, LineaContableModel, DocumentoFuenteModel } = await import(
  "../packages/db/dist/index.js"
);
const { esLineaSinSentidoContable, esLineaProbableRuidoExtraccion } = await import(
  "../packages/pipeline/dist/index.js"
);

const caso = await CasoModel.findOne({ numero });
if (!caso) {
  console.log("Caso no encontrado");
  process.exit(1);
}
const casoId = caso._id.toString();

const [lineas, docs] = await Promise.all([
  LineaContableModel.find({ casoId }).sort({ paginaNumero: 1, denominacionOriginal: 1 }),
  DocumentoFuenteModel.find({ casoId }),
]);

console.log("=== CASO", numero, "===");
console.log("Estado:", caso.estado, "| Semáforo:", caso.semaforo, "| Conf:", caso.confianzaGlobal);
console.log("Docs:", docs.map((d) => d.nombreOriginal).join(", "));
console.log("Total líneas:", lineas.length);

const stats = {
  sinRubro: 0,
  requiereRevision: 0,
  bajaConfianza: 0,
  iaPre: 0,
  ruidoDetectable: 0,
  sinSentido: 0,
  porPagina: new Map(),
  porOrigen: new Map(),
};

for (const l of lineas) {
  if (!l.rubroInstitucionalId) stats.sinRubro++;
  if (l.requiereRevision) stats.requiereRevision++;
  if ((l.confianzaClasificacion ?? 0) < 85) stats.bajaConfianza++;
  if (l.origenClasificacion === "ia_pre_revision" || l.origenClasificacion === "ia_revision")
    stats.iaPre++;
  const p = l.paginaNumero ?? 0;
  stats.porPagina.set(p, (stats.porPagina.get(p) ?? 0) + 1);
  const o = l.origenClasificacion ?? "—";
  stats.porOrigen.set(o, (stats.porOrigen.get(o) ?? 0) + 1);

  const like = {
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  };
  if (esLineaProbableRuidoExtraccion(like)) stats.ruidoDetectable++;
  if (esLineaSinSentidoContable(like)) stats.sinSentido++;
}

console.log("\n=== RESUMEN ===");
console.log("Sin rubro:", stats.sinRubro);
console.log("Requiere revisión:", stats.requiereRevision);
console.log("Confianza < 85%:", stats.bajaConfianza);
console.log("Clasificadas por IA:", stats.iaPre);
console.log("Detectables como ruido (reglas actuales):", stats.ruidoDetectable);
console.log("Sin sentido contable (reglas actuales):", stats.sinSentido);
console.log("Por página:", [...stats.porPagina.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p${p}:${n}`).join(" "));
console.log("Por origen:", [...stats.porOrigen.entries()].map(([o, n]) => `${o}:${n}`).join(" "));

console.log("\n=== SIN RUBRO (Falta info) ===");
for (const l of lineas.filter((x) => !x.rubroInstitucionalId)) {
  console.log(
    `p${l.paginaNumero} | conf ${l.confianzaClasificacion ?? 0}% | ${l.montoNormalizado ?? l.montoOriginal} | ${l.denominacionOriginal.slice(0, 90)}`
  );
}

console.log("\n=== PENDIENTE APROBAR (rubro pero requiereRevision) ===");
for (const l of lineas.filter((x) => x.rubroInstitucionalId && x.requiereRevision)) {
  console.log(
    `p${l.paginaNumero} | conf ${l.confianzaClasificacion ?? 0}% | ${l.rubroCodigo} | ${l.montoNormalizado ?? l.montoOriginal} | ${l.denominacionOriginal.slice(0, 80)} | origen=${l.origenClasificacion ?? "?"}`
  );
}

console.log("\n=== SOSPECHOSAS p13-14 (tablas/fragmentos) ===");
const sospechosas = lineas.filter((l) => (l.paginaNumero === 13 || l.paginaNumero === 14) && (
  /\bagregados\b/i.test(l.denominacionOriginal) ||
  /\bferroviario\b/i.test(l.denominacionOriginal) ||
  /\bcemento\b/i.test(l.denominacionOriginal) ||
  /\bhormig[oó]n\b/i.test(l.denominacionOriginal) ||
  /\d+\s+\d+[,.]?\d*\s*%/.test(l.denominacionOriginal) ||
  /\beliminaciones\b/i.test(l.denominacionOriginal) ||
  /\bnuevos pr[eé]stamos\b/i.test(l.denominacionOriginal)
));
for (const l of sospechosas) {
  const ruido = esLineaSinSentidoContable({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  });
  console.log(
    `[${ruido ? "RUIDO" : "OK"}] p${l.paginaNumero} | rubro=${l.rubroCodigo ?? "—"} | rev=${l.requiereRevision} | ${l.denominacionOriginal.slice(0, 100)}`
  );
}

console.log("\n=== LÍNEAS POR PÁGINA CLAVE (balance/ER/flujo/segmentos) ===");
for (const p of [11, 12, 13, 14]) {
  const L = lineas.filter((l) => l.paginaNumero === p);
  console.log(`\n--- Pág. ${p} (${L.length} líneas) ---`);
  for (const l of L) {
    console.log(
      `${l.rubroCodigo ?? "—"} | ${l.confianzaClasificacion ?? 0}% | rev=${l.requiereRevision} | ${l.origenClasificacion ?? "?"} | ${l.denominacionOriginal.slice(0, 70)}`
    );
  }
}

await mongoose.disconnect();
