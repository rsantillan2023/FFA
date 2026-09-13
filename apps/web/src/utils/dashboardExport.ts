import type { KpisDto } from "@ffa/shared";
import { formatMinutos } from "./formatDuration";

export interface DashboardExportRow {
  id: string;
  label: string;
  value: string;
  hint?: string;
  group: "operacion" | "tiempos" | "calidad" | "aprendizaje";
}

const CANAL_LABELS: Record<string, string> = {
  portal: "Portal web",
  correo: "Correo electrónico",
  manual_alternativa: "Carga alternativa",
};

function formatPeriodo(periodo: string): string {
  const [y, mo] = periodo.split("-");
  if (!y || !mo) return periodo;
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const idx = Number(mo) - 1;
  return `${meses[idx] ?? mo} ${y}`;
}

function formatCuadratura(kpis: KpisDto): { value: string; hint: string } {
  const cal = kpis.calidad;
  if (!cal) return { value: "—", hint: "" };
  const ok = cal.casosConCuadraturaOk;
  const total = cal.casosCuadraturaTotal;
  if (ok != null && total != null && total > 0) {
    return {
      value: `${ok} de ${total} (${cal.pctCuadraturaVerificada}%)`,
      hint: "Activo = Pasivo + Patrimonio verificado al cerrar la ficha",
    };
  }
  return {
    value: `${cal.pctCuadraturaVerificada}%`,
    hint: "Porcentaje de fichas cerradas con cuadratura contable OK",
  };
}

/** Texto legible para la métrica de cuadratura (home y export). */
export function formatCuadraturaLabel(kpis: KpisDto): string {
  return formatCuadratura(kpis).value;
}

export function buildDashboardExportRows(kpis: KpisDto): DashboardExportRow[] {
  const rows: DashboardExportRow[] = [
    {
      id: "total",
      group: "operacion",
      label: "Fichas en el sistema",
      value: String(kpis.resumen.totalCasos),
      hint: "Expedientes registrados",
    },
    {
      id: "revision",
      group: "operacion",
      label: "Esperando revisión",
      value: String(kpis.resumen.enRevision),
      hint: "Requieren analista",
    },
    {
      id: "aprobados",
      group: "operacion",
      label: "Fichas cerradas",
      value: String(kpis.resumen.aprobados),
      hint: "Aprobadas",
    },
    {
      id: "informes",
      group: "operacion",
      label: "Informes de comité",
      value: String(kpis.resumen.informesGenerados),
      hint: "Documentos generados",
    },
    {
      id: "auto",
      group: "operacion",
      label: "Resueltas sin intervención",
      value: `${kpis.operacion.tasaResolucionAutomaticaPct}%`,
      hint: "Procesadas solo por el sistema",
    },
    {
      id: "cobertura",
      group: "operacion",
      label: "Documentos procesados bien",
      value: kpis.operacion.coberturaProcesamientoPct != null ? `${kpis.operacion.coberturaProcesamientoPct}%` : "—",
      hint: "Sin quedar atascados",
    },
  ];

  if (kpis.tiempos) {
    rows.push(
      {
        id: "tiempo",
        group: "tiempos",
        label: "Tiempo promedio hasta aprobar",
        value: formatMinutos(kpis.tiempos.promedioMinutosAprobacion),
        hint: `Meta del equipo: ${kpis.tiempos.metaMinutos} min`,
      },
      {
        id: "mejora",
        group: "tiempos",
        label: "Mejora vs. proceso manual",
        value:
          kpis.tiempos.reduccionVsBaselineHorasPct != null
            ? `${kpis.tiempos.reduccionVsBaselineHorasPct}%`
            : "—",
        hint: `Referencia manual: ~${kpis.tiempos.baselineReferenciaHoras} h`,
      },
    );
  }

  if (kpis.calidad) {
    const cuadratura = formatCuadratura(kpis);
    rows.push(
      {
        id: "cuadratura",
        group: "calidad",
        label: "Fichas cerradas que cuadran",
        value: cuadratura.value,
        hint: cuadratura.hint,
      },
      {
        id: "trazabilidad",
        group: "calidad",
        label: "Con respaldo documental",
        value: `${kpis.calidad.pctTrazabilidadCompleta}%`,
      },
      {
        id: "sin-intervencion",
        group: "calidad",
        label: "Sin revisar línea por línea",
        value: `${kpis.calidad.pctCasosSinIntervencionHumana}%`,
      },
      {
        id: "alertas",
        group: "calidad",
        label: "Alertas confirmadas",
        value: String(kpis.calidad.inconsistenciasConfirmadas),
      },
    );
  }

  if (kpis.aprendizaje) {
    rows.push({
      id: "historial",
      group: "aprendizaje",
      label: "Empresas con historial",
      value: String(kpis.aprendizaje.contribuyentesConHistorial),
    });
  }

  if (kpis.pipelineErrores != null) {
    rows.push({
      id: "incidentes",
      group: "operacion",
      label: "Incidentes de procesamiento",
      value: String(kpis.pipelineErrores),
      hint: kpis.pipelineErrores === 0 ? "Sin problemas recientes" : "Revisar operación",
    });
  }

  return rows;
}

export function buildDashboardResumenTexto(kpis: KpisDto): string {
  const fecha = new Date(kpis.generadoAt).toLocaleString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [
    "RESUMEN OPERATIVO SOOFT FINYX",
    `Generado: ${fecha}`,
    "",
    "— Fichas y trabajo —",
    `Fichas en el sistema: ${kpis.resumen.totalCasos}`,
    `Esperando revisión del analista: ${kpis.resumen.enRevision}`,
    `Fichas cerradas (aprobadas): ${kpis.resumen.aprobados}`,
    `Informes de comité generados: ${kpis.resumen.informesGenerados}`,
    `Resueltas sin intervención humana: ${kpis.operacion.tasaResolucionAutomaticaPct}%`,
  ];

  if (kpis.operacion.coberturaProcesamientoPct != null) {
    lines.push(`Documentos procesados correctamente: ${kpis.operacion.coberturaProcesamientoPct}%`);
  }

  if (kpis.tiempos) {
    lines.push("");
    lines.push("— Tiempos —");
    lines.push(`Promedio hasta aprobar: ${formatMinutos(kpis.tiempos.promedioMinutosAprobacion)}`);
    lines.push(`Meta del equipo: ${kpis.tiempos.metaMinutos} min`);
    if (kpis.tiempos.reduccionVsBaselineHorasPct != null) {
      lines.push(
        `Mejora vs. proceso manual (~${kpis.tiempos.baselineReferenciaHoras} h): ${kpis.tiempos.reduccionVsBaselineHorasPct}%`,
      );
    }
  }

  if (kpis.calidad) {
    lines.push("");
    lines.push("— Calidad —");
    const cuadratura = formatCuadratura(kpis);
    lines.push(`Fichas cerradas que cuadran: ${cuadratura.value}`);
    lines.push(`Con trazabilidad completa: ${kpis.calidad.pctTrazabilidadCompleta}%`);
    lines.push(`Sin revisión línea a línea: ${kpis.calidad.pctCasosSinIntervencionHumana}%`);
    lines.push(`Alertas confirmadas por el equipo: ${kpis.calidad.inconsistenciasConfirmadas}`);
  }

  if (kpis.resolucionAutomaticaMensual?.length) {
    lines.push("");
    lines.push("— Evolución mensual —");
    for (const m of kpis.resolucionAutomaticaMensual) {
      lines.push(
        `${formatPeriodo(m.periodo)}: ${m.pctSinIntervencion}% sin revisión manual (${m.casosAprobados} ficha(s))`,
      );
    }
  }

  if (kpis.casosPorCanal && Object.keys(kpis.casosPorCanal).length) {
    lines.push("");
    lines.push("— Origen de las fichas —");
    for (const [canal, n] of Object.entries(kpis.casosPorCanal)) {
      lines.push(`${CANAL_LABELS[canal] ?? canal}: ${n}`);
    }
  }

  if (kpis.pipelineErrores != null) {
    lines.push("");
    lines.push(`Incidentes de procesamiento: ${kpis.pipelineErrores}`);
  }

  return lines.join("\n");
}

export const EXPORT_GROUP_LABELS: Record<DashboardExportRow["group"], string> = {
  operacion: "Fichas y operación",
  tiempos: "Tiempos del equipo",
  calidad: "Calidad del trabajo",
  aprendizaje: "Experiencia acumulada",
};
