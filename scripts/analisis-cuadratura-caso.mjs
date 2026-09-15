/**
 * Análisis de cuadratura para un expediente (uso local).
 * node scripts/analisis-cuadratura-caso.mjs FFA-2026-00011
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00011";

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";

const Caso = mongoose.model(
  "Caso",
  new mongoose.Schema({}, { strict: false, collection: "casos" })
);
const Linea = mongoose.model(
  "LineaContable",
  new mongoose.Schema({}, { strict: false, collection: "lineacontables" })
);
const Rubro = mongoose.model(
  "RubroInstitucional",
  new mongoose.Schema({}, { strict: false, collection: "rubroinstitucionals" })
);

function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function monto(l) {
  return l.montoNormalizado ?? l.montoOriginal ?? 0;
}

function esTotal(d) {
  const x = norm(d);
  return /\btotal(es)?\b/.test(x) || /\bsubtotal/.test(x) || /^suma /.test(x);
}

function esFlujo(d) {
  const x = norm(d);
  return (
    /\bflujo/.test(x) ||
    /\befectivo y equivalentes al (inicio|cierre)/.test(x) ||
    /\b(disminucion|aumento) nety? de/.test(x) ||
    /\bresultado por accion/.test(x)
  );
}

function esER(d) {
  const x = norm(d);
  return (
    /^ingresos por/.test(x) ||
    /^costo de/.test(x) ||
    /^gastos de/.test(x) ||
    /\bresultado neto/.test(x) ||
    /\bimpuesto a las ganancias/.test(x) ||
    /\bresultados financieros/.test(x)
  );
}

function fmt(n) {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)} bill.`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)} mil mill.`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)} mill.`;
  return n.toLocaleString("es-AR");
}

await mongoose.connect(uri);

const caso = await Caso.findOne({ numero }).lean();
if (!caso) {
  console.error(`No se encontró caso ${numero}`);
  process.exit(1);
}

const casoId = caso._id.toString();
const lineas = await Linea.find({ casoId: caso._id }).lean();
const rubros = await Rubro.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true }).lean();
const rubroById = new Map(rubros.map((r) => [r._id.toString(), r]));
const rubroByCodigo = new Map(rubros.map((r) => [r.codigo, r]));

function resolveRubro(l) {
  if (l.rubroInstitucionalId) {
    const r = rubroById.get(l.rubroInstitucionalId.toString());
    if (r) return r;
  }
  if (l.rubroCodigo) return rubroByCodigo.get(l.rubroCodigo);
  return null;
}

const padres = new Set(rubros.filter((r) => r.padreId).map((r) => r.padreId.toString()));
function esAsignable(r) {
  if (!r) return false;
  if (padres.has(r._id.toString())) return false;
  if (/^[123]$/.test(String(r.codigo).trim())) return false;
  return true;
}

// --- buckets ---
const stats = {
  totalLineas: lineas.length,
  sinRubro: 0,
  agrupador: 0,
  totales: 0,
  flujo: 0,
  er: 0,
  comparativa: 0,
  detalleBalance: 0,
  activo: 0,
  pasivo: 0,
  patrimonio: 0,
  resultados: 0,
};

const topActivo = [];
const topPasivo = [];
const patrimonioLines = [];
const misPatrimonioEnPasivo = [];
const scalePairs = [];
const totalLines = [];

const byDenom = new Map();

for (const l of lineas) {
  const d = l.denominacionOriginal || "";
  const m = monto(l);
  const rubro = resolveRubro(l);
  const estado = rubro?.estadoFinanciero;

  if (esTotal(d)) {
    stats.totales++;
    totalLines.push({ d, m, codigo: rubro?.codigo, estado });
  }
  if (esFlujo(d)) stats.flujo++;
  if (esER(d)) stats.er++;
  if (/\b31\/12\/20\d{2}\b/.test(norm(d))) stats.comparativa++;

  if (!rubro) {
    stats.sinRubro++;
    continue;
  }
  if (!esAsignable(rubro)) stats.agrupador++;

  const denomKey = norm(d).replace(/\s+\d{1,3}$/, "");
  const g = byDenom.get(denomKey) || [];
  g.push({ l, m: Math.abs(m) });
  byDenom.set(denomKey, g);

  const esDetalle =
    esAsignable(rubro) &&
    !esTotal(d) &&
    !esFlujo(d) &&
    !esER(d) &&
    estado !== "resultados";

  if (esDetalle && (estado === "activo" || estado === "pasivo" || estado === "patrimonio")) {
    stats.detalleBalance++;
    if (estado === "activo") {
      stats.activo += m;
      topActivo.push({ d, m, codigo: rubro.codigo });
    } else if (estado === "pasivo") {
      stats.pasivo += m;
      topPasivo.push({ d, m, codigo: rubro.codigo });
    } else if (estado === "patrimonio") {
      stats.patrimonio += m;
      patrimonioLines.push({ d, m, codigo: rubro.codigo });
    }
  }

  if (estado === "resultados") stats.resultados += m;

  if (/patrimonio|controlante|no controlante|acciones en circulacion|capital|reservas|resultados no asignados/i.test(d)) {
    if (estado === "pasivo" || rubro?.codigo?.startsWith("2")) {
      misPatrimonioEnPasivo.push({ d, m, codigo: rubro?.codigo, estado });
    }
  }
}

for (const [denom, items] of byDenom) {
  if (items.length < 2) continue;
  const sorted = [...items].sort((a, b) => b.m - a.m);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i].m;
      const b = sorted[j].m;
      if (b === 0) continue;
      const ratio = a / b;
      if (ratio >= 900 && ratio <= 1100) {
        scalePairs.push({ denom, mayor: a, menor: b });
        break;
      }
    }
  }
}

topActivo.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
topPasivo.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
misPatrimonioEnPasivo.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
totalLines.sort((a, b) => Math.abs(b.m) - Math.abs(a.m));

const diff = stats.activo - (stats.pasivo + stats.patrimonio);

console.log(JSON.stringify({
  expediente: numero,
  casoId,
  razonSocial: caso.razonSocial || caso.metadata?.razonSocial,
  moneda: caso.moneda,
  escala: caso.escala,
  estado: caso.estado,
  lineas: stats.totalLineas,
  clasificacion: {
    sinRubro: stats.sinRubro,
    agrupadorRubro: stats.agrupador,
    filasTotalSubtotal: stats.totales,
    filasFlujo: stats.flujo,
    filasERenBalance: stats.er,
    comparativasFecha: stats.comparativa,
    detalleBalance: stats.detalleBalance,
  },
  cuadraturaDetalleSimulada: {
    activo: stats.activo,
    pasivo: stats.pasivo,
    patrimonio: stats.patrimonio,
    pasivoMasPatrimonio: stats.pasivo + stats.patrimonio,
    diferencia: diff,
    pctActivoExplicadoPorPatrimonioMalClasificado: misPatrimonioEnPasivo.reduce((s, x) => s + x.m, 0),
  },
  resultadosRubro: stats.resultados,
  top10Activo: topActivo.slice(0, 10).map((x) => ({ concepto: x.d.slice(0, 60), monto: x.m, rubro: x.codigo })),
  top10Pasivo: topPasivo.slice(0, 10).map((x) => ({ concepto: x.d.slice(0, 60), monto: x.m, rubro: x.codigo })),
  patrimonioDetalle: patrimonioLines.map((x) => ({ concepto: x.d.slice(0, 60), monto: x.m, rubro: x.codigo })),
  patrimonioMalEnPasivoTop15: misPatrimonioEnPasivo.slice(0, 15).map((x) => ({
    concepto: x.d.slice(0, 60),
    monto: x.m,
    rubro: x.codigo,
  })),
  totalesPDFTop10: totalLines.slice(0, 10).map((x) => ({
    concepto: x.d.slice(0, 60),
    monto: x.m,
    rubro: x.codigo,
    estado: x.estado,
  })),
  paresEscalaX1000: scalePairs.slice(0, 20).map((x) => ({
    concepto: x.denom.slice(0, 50),
    mayor: x.mayor,
    menor: x.menor,
  })),
  paresEscalaCount: scalePairs.length,
}, null, 2));

await mongoose.disconnect();
