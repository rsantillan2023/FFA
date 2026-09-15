import fs from "fs";
import { fusionarExtractTextoNativoPrimario } from "../packages/pipeline/dist/extract/extract-native-text-primary.js";

const inspect = JSON.parse(fs.readFileSync("scripts/inspect-00018-out.json", "utf8"));
const paginas = inspect.documento.paginasIncluidas;

const mockResult = {
  tipoDocumento: "mixto",
  metadata: {
    moneda: "CLP",
    escala: "miles",
    periodo: { ejercicio: 2025 },
  },
  lineas: inspect.lineasDetalle.map((l) => ({
    denominacionOriginal: l.denom,
    montoOriginal: l.montoOrig,
    montoNormalizado: l.montoOrig,
    paginaNumero: l.pag,
    seccionPagina: l.pag <= 2 ? "balance" : "resultados",
    confianzaExtraccion: l.confExt ?? 0.95,
    metodoExtraccion: "vision_llm",
  })),
  paginasClasificadas: paginas.map((p) => ({
    pagina: p.pagina,
    seccion: p.seccion,
    score: p.score,
    incluida: true,
    textoEscaneado: p.textoEscaneado,
  })),
  provenanceExtraccion: {
    proveedorExtraccion: "openai",
    seleccionPaginas: "pdf_corto_completo",
    complementoHeuristicoPostExtract: false,
    paginasPdfTotal: 3,
    paginasEnviadasVision: 3,
    paginasOmitidasVision: 0,
    usedClaudePageMap: false,
  },
};

const merged = fusionarExtractTextoNativoPrimario(mockResult);
console.log("Nativo primario:", merged.provenanceExtraccion?.textoNativoPrimario);
console.log("Líneas antes:", mockResult.lineas.length, "después:", merged.lineas.length);
console.log("Desde texto nativo:", merged.provenanceExtraccion?.lineasDesdeTextoNativo);
console.log("Añadidas:", merged.provenanceExtraccion?.lineasAnadidasDesdeTexto);
console.log("Montos corregidos:", merged.provenanceExtraccion?.lineasMontosCorregidos);

const activoMant = merged.lineas.find((l) =>
  /mantenidos para la venta/i.test(l.denominacionOriginal)
);
console.log(
  "Activos venta monto:",
  activoMant?.montoOriginal,
  "(esperado ~19677322)"
);
