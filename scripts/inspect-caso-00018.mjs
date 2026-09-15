import mongoose from "mongoose";
import { config } from "dotenv";
import { writeFileSync } from "fs";

config();

const numero = process.argv[2] || "FFA-2026-00018";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";
await mongoose.connect(uri);
const db = mongoose.connection.db;

const caso = await db.collection("casos").findOne({ numero });
if (!caso) {
  console.log("Caso no encontrado:", numero);
  process.exit(1);
}

const casoId = caso._id;
const lineas = await db.collection("lineacontables").find({ casoId }).sort({ paginaNumero: 1 }).toArray();
const doc = await db.collection("documentofuentes").findOne({ casoId });

const report = {
  caso: {
    id: casoId.toString(),
    numero: caso.numero,
    referencia: caso.referencia,
    estado: caso.estado,
    moneda: caso.moneda,
    escala: caso.escala,
    confianzaGlobal: caso.confianzaGlobal,
    semaforo: caso.semaforo,
  },
  documento: doc
    ? {
        nombre: doc.nombreOriginal,
        paginaCount: doc.paginaCount,
        calidadOrigen: doc.calidadOrigen,
        metadata: doc.extractMetadata,
        provenance: doc.extractPayload?.provenanceExtraccion,
        paginasIncluidas: doc.extractPayload?.paginasClasificadas?.filter((p) => p.incluida),
        informe: {
          paginasTotales: doc.extractPayload?.informeExtraccion?.paginasTotales,
          paginasProcesadas: doc.extractPayload?.informeExtraccion?.paginasProcesadas,
          cuentasExtraidas: doc.extractPayload?.informeExtraccion?.cuentasExtraidas,
          confianzaGlobal: doc.extractPayload?.informeExtraccion?.confianzaGlobal,
          lineasOmitidas: doc.extractPayload?.informeExtraccion?.coberturaTablas?.reduce(
            (s, t) => s + (t.filasOmitidas ?? 0),
            0
          ),
        },
      }
    : null,
  lineasTotal: lineas.length,
  origenClasificacion: {},
  requiereRevision: lineas.filter((l) => l.requiereRevision).length,
  confianzaBaja: lineas.filter((l) => (l.confianzaClasificacion ?? 0) < 85).length,
  activoLineas: [],
};

for (const l of lineas) {
  const o = l.origenClasificacion || "sin";
  report.origenClasificacion[o] = (report.origenClasificacion[o] || 0) + 1;
}

const activo = lineas.filter(
  (l) => l.rubroCodigo?.startsWith("1.") || /activo/i.test(l.denominacionOriginal ?? "")
);
for (const l of activo.slice(0, 30)) {
  report.activoLineas.push({
    denom: l.denominacionOriginal,
    pag: l.paginaNumero,
    montoOrig: l.montoOriginal,
    montoNorm: l.montoNormalizado,
    confExt: l.confianzaExtraccion,
    confClas: l.confianzaClasificacion,
    origen: l.origenClasificacion,
    rubro: l.rubroCodigo,
    requiereRevision: l.requiereRevision,
    excluir: l.excluirDeCuadratura,
  });
}

// Totales aproximados activo
let sumActivo = 0;
for (const l of lineas) {
  if (l.excluirDeCuadratura) continue;
  if (l.rubroCodigo?.startsWith("1.")) {
    sumActivo += l.montoNormalizado ?? l.montoOriginal ?? 0;
  }
}
report.sumActivoRubro1 = sumActivo;

report.totalesPdf = {
  totalActivosPdfMiles: 26812998391,
  totalPasivoPdfMiles: 16643138864,
  totalPatrimonioPdfMiles: 10169859527,
};
report.lineasDetalle = lineas.map((l) => ({
  denom: l.denominacionOriginal,
  pag: l.paginaNumero,
  montoOrig: l.montoOriginal,
  montoNorm: l.montoNormalizado,
  confExt: l.confianzaExtraccion,
  confClas: l.confianzaClasificacion,
  origen: l.origenClasificacion,
  rubro: l.rubroCodigo,
  requiereRevision: l.requiereRevision,
  clasificacionIaAt: l.clasificacionIaAt ?? null,
  excluir: l.excluirDeCuadratura,
}));

const factorVsPdf = (monto, pdfMiles) => (pdfMiles ? monto / pdfMiles : null);
const totalActivoLinea = lineas.find((l) => /^TOTAL ACTIVOS$/i.test(l.denominacionOriginal ?? ""));
if (totalActivoLinea) {
  report.escalaDiagnostico = {
    montoSistema: totalActivoLinea.montoNormalizado ?? totalActivoLinea.montoOriginal,
    montoPdfMiles: 26812998391,
    ratio: factorVsPdf(
      totalActivoLinea.montoNormalizado ?? totalActivoLinea.montoOriginal,
      26812998391
    ),
  };
}

writeFileSync("scripts/inspect-00018-out.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await mongoose.disconnect();
