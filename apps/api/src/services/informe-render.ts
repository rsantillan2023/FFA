import {
  CasoModel,
  ContribuyenteModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  type FichaCanonicaDocument,
} from "@ffa/db";
import type { IndicadorCalculadoDocument } from "@ffa/db";
import {
  filasDetalleTrazabilidad,
  filasInconsistencias,
  fmtIndicadorValor,
  fmtMonto,
  indicadorNombre,
  renderTable2,
  renderTable3,
  resolveIdentidadInforme,
} from "./informe-helpers.js";

export const INFORME_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Informe {{numero_caso}} — {{contribuyente}}</title>
<style>
:root{--brand:#0f766e;--brand-dark:#134e4a;--ink:#0f172a;--muted:#64748b;--border:#e2e8f0;--bg:#f8fafc;--ok:#16a34a;--warn:#ca8a04;--bad:#dc2626}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);background:#eef2f6;line-height:1.5}
.page{max-width:920px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(15,23,42,.08)}
.header{background:linear-gradient(135deg,var(--brand-dark),var(--brand));color:#fff;padding:2rem 2.5rem 1.75rem}
.header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}
.brand{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin:0 0 .35rem}
.header h1{margin:0;font-size:1.65rem;font-weight:700;line-height:1.2}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem 1.25rem;margin-top:1.25rem;font-size:.875rem}
.meta-grid dt{margin:0;color:rgba(255,255,255,.7);font-size:.7rem;text-transform:uppercase;letter-spacing:.06em}
.meta-grid dd{margin:.15rem 0 0;font-weight:600}
.badge{display:inline-block;padding:.2rem .65rem;border-radius:999px;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.badge--verde{background:#dcfce7;color:#166534}
.badge--amarillo{background:#fef9c3;color:#854d0e}
.badge--rojo{background:#fee2e2;color:#991b1b}
.badge--preliminar{background:rgba(255,255,255,.2);color:#fff}
.badge--final{background:#fff;color:var(--brand-dark)}
.cierre-parcial-banner{margin:0 2.5rem;padding:1rem 1.15rem;border-radius:10px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;font-size:.9rem;line-height:1.45}
.cierre-parcial-banner strong{display:block;margin-bottom:.35rem;color:#78350f;font-size:.95rem}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;padding:1.5rem 2.5rem;background:var(--bg);border-bottom:1px solid var(--border)}
.kpi{background:#fff;border:1px solid var(--border);border-radius:10px;padding:1rem 1.1rem}
.kpi-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 .25rem}
.kpi-value{font-size:1.35rem;font-weight:700;color:var(--brand-dark);margin:0}
.kpi-hint{font-size:.75rem;color:var(--muted);margin:.35rem 0 0}
.content{padding:2rem 2.5rem 2.5rem}
.section{margin-bottom:2rem}
.section h2{font-size:1.05rem;color:var(--brand-dark);margin:0 0 .75rem;padding-bottom:.4rem;border-bottom:2px solid var(--brand);display:inline-block}
.lead{font-size:1rem;color:#334155;margin:0 0 1rem}
.prose p{margin:.65rem 0}
table.data{width:100%;border-collapse:collapse;font-size:.875rem;margin:.5rem 0 1rem}
table.data th,table.data td{border:1px solid var(--border);padding:.55rem .75rem;text-align:left;vertical-align:top}
table.data th{background:#f1f5f9;font-weight:600;color:#334155;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}
table.data td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.data tr.total td{font-weight:700;background:#f8fafc}
table.data tr:nth-child(even) td{background:#fafbfc}
.empty{color:var(--muted);font-style:italic;font-size:.875rem}
.inc-critical td:first-child{color:var(--bad);font-weight:600}
.inc-warning td:first-child{color:var(--warn);font-weight:600}
.footer{padding:1.25rem 2.5rem;background:var(--bg);border-top:1px solid var(--border);font-size:.78rem;color:var(--muted)}
@media print{body{background:#fff}.page{box-shadow:none}}
</style>
</head>
<body>
<div class="page">
<header class="header">
<div class="header-top">
<div>
<p class="brand">ECR Salud · Comité Factoring</p>
<h1>Informe de evaluación financiera</h1>
</div>
<div>{{semaforo_badge}} {{estado_badge}}</div>
</div>
{{cierre_parcial_banner}}
<dl class="meta-grid">
<dt>Caso</dt><dd>{{numero_caso}}</dd>
<dt>Contribuyente</dt><dd>{{contribuyente}}</dd>
<dt>RUT</dt><dd>{{rut}}</dd>
<dt>Ejercicio</dt><dd>{{periodo}}</dd>
<dt>Moneda / escala</dt><dd>{{moneda}} · {{escala}}</dd>
<dt>Confianza pipeline</dt><dd>{{confianza_pct}}</dd>
</dl>
</header>
<section class="kpis">
<div class="kpi"><p class="kpi-label">Liquidez corriente</p><p class="kpi-value">{{kpi_liquidez}}</p><p class="kpi-hint">Activo corriente / Pasivo corriente</p></div>
<div class="kpi"><p class="kpi-label">Endeudamiento total</p><p class="kpi-value">{{kpi_endeudamiento}}</p><p class="kpi-hint">Pasivo / Activo total</p></div>
<div class="kpi"><p class="kpi-label">Capital de trabajo</p><p class="kpi-value">{{kpi_cap_trabajo}}</p><p class="kpi-hint">AC − PC</p></div>
<div class="kpi"><p class="kpi-label">Utilidad ejercicio</p><p class="kpi-value">{{kpi_utilidad}}</p><p class="kpi-hint">Estado de resultados</p></div>
</section>
<main class="content">
<section class="section">
<h2>Resumen ejecutivo</h2>
<p class="lead">{{resumen_ejecutivo}}</p>
</section>
<section class="section">
<h2>Balance general resumido</h2>
{{tabla_balance}}
</section>
<section class="section">
<h2>Detalle por rubro (balance)</h2>
{{tabla_balance_detalle}}
</section>
<section class="section">
<h2>Estado de resultados</h2>
{{tabla_er}}
</section>
<section class="section">
<h2>Indicadores financieros</h2>
{{tabla_indicadores}}
</section>
<section class="section">
<h2>Detalle con trazabilidad documental</h2>
<p class="lead">Cada monto vinculado al documento fuente y página de origen (P.1 trazabilidad).</p>
{{tabla_trazabilidad}}
</section>
<section class="section">
<h2>Validaciones e inconsistencias</h2>
{{tabla_inconsistencias}}
</section>
<section class="section prose">
<h2>Análisis del analista</h2>
{{apartado_analisis}}
</section>
<section class="section prose">
<h2>Recomendación comité</h2>
{{apartado_recomendacion}}
</section>
</main>
<footer class="footer">
Generado {{fecha}} · Ficha canónica v{{ficha_version}} · Estado del informe: {{estado_informe}} · SOOFT FINYX
</footer>
</div>
</body>
</html>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function proseHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '<p class="empty">(Pendiente — completar en editor)</p>';
  return trimmed
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function cierreParcialBannerHtml(ficha: FichaCanonicaDocument): string {
  if (!ficha.cierreParcial) return "";
  const motivo = ficha.motivoCierreParcial?.trim();
  const motivoHtml = motivo
    ? `<p>${escapeHtml(motivo)}</p>`
    : "<p>La ficha se cerró con observaciones documentadas por el analista.</p>";
  return `<aside class="cierre-parcial-banner" role="note"><strong>Limitaciones de la ficha — cierre parcial</strong>${motivoHtml}<p>Este informe refleja la información disponible al momento del cierre; puede incluir cuadratura pendiente o líneas sin confirmar.</p></aside>`;
}

function semaforoBadge(semaforo?: string | null): string {
  const s = semaforo ?? "amarillo";
  const label = s === "verde" ? "Semáforo verde" : s === "rojo" ? "Semáforo rojo" : "Semáforo amarillo";
  return `<span class="badge badge--${s}">${label}</span>`;
}

function estadoBadge(estado: string): string {
  const cls = estado.toLowerCase() === "final" ? "final" : "preliminar";
  const label = cls === "final" ? "Informe final" : "Preliminar";
  return `<span class="badge badge--${cls}">${label}</span>`;
}

function indicadorMap(indicadores: IndicadorCalculadoDocument[]): Map<string, IndicadorCalculadoDocument> {
  return new Map(indicadores.map((i) => [i.indicadorCodigo, i]));
}

function kpiFromIndicadores(
  indicadores: IndicadorCalculadoDocument[],
  ficha: FichaCanonicaDocument,
  moneda: string,
  escala: string
): Record<string, string> {
  const map = indicadorMap(indicadores);
  const liq = map.get("LIQ_CORRIENTE");
  const end = map.get("END_TOTAL");
  const cap = map.get("CAP_TRABAJO");

  return {
    kpi_liquidez: liq?.calculable ? fmtIndicadorValor("LIQ_CORRIENTE", liq.valor) : "N/C",
    kpi_endeudamiento: end?.calculable ? fmtIndicadorValor("END_TOTAL", end.valor) : "N/C",
    kpi_cap_trabajo: cap?.calculable
      ? fmtMonto(cap.valor, moneda, escala)
      : fmtMonto(
          (ficha.balance?.activoCorriente ?? 0) - (ficha.balance?.pasivoCorriente ?? 0),
          moneda,
          escala
        ),
    kpi_utilidad: fmtMonto(ficha.estadoResultados?.utilidad, moneda, escala),
  };
}

export function buildResumenEjecutivo(input: {
  razonSocial: string;
  periodo: string;
  semaforo?: string | null;
  confianza?: number | null;
  indicadores: IndicadorCalculadoDocument[];
  moneda: string;
  escala: string;
}): string {
  const map = indicadorMap(input.indicadores);
  const liq = map.get("LIQ_CORRIENTE");
  const end = map.get("END_TOTAL");
  const liqTxt = liq?.calculable ? fmtIndicadorValor("LIQ_CORRIENTE", liq.valor) : "no calculable";
  const endTxt = end?.calculable ? fmtIndicadorValor("END_TOTAL", end.valor) : "no calculable";
  const conf = input.confianza != null ? `${input.confianza}%` : "—";

  const calidad =
    input.semaforo === "verde"
      ? "La ficha canónica fue aprobada con validaciones satisfactorias y trazabilidad completa."
      : input.semaforo === "rojo"
        ? "Se registraron alertas relevantes en validaciones; el caso requiere revisión reforzada antes de comité."
        : "El caso presenta observaciones menores resueltas o documentadas por el analista.";

  return (
    `${input.razonSocial} — ejercicio ${input.periodo}. ${calidad} ` +
    `Confianza global del pipeline: ${conf}. Liquidez corriente ${liqTxt}; endeudamiento total ${endTxt}. ` +
    `Los montos se expresan en ${input.moneda} (${input.escala}).`
  );
}

function balanceResumidoRows(
  ficha: FichaCanonicaDocument,
  moneda: string,
  escala: string
): [string, string][] {
  const ac = ficha.balance?.activoCorriente ?? 0;
  const anc = ficha.balance?.activoNoCorriente ?? 0;
  const pc = ficha.balance?.pasivoCorriente ?? 0;
  const pnc = ficha.balance?.pasivoNoCorriente ?? 0;
  const pat = ficha.balance?.patrimonio ?? 0;
  const totalActivo = ac + anc;
  const totalPasivo = pc + pnc;

  return [
    ["Activo corriente", fmtMonto(ac, moneda, escala)],
    ["Activo no corriente", fmtMonto(anc, moneda, escala)],
    ["Total activo", fmtMonto(totalActivo, moneda, escala)],
    ["Pasivo corriente", fmtMonto(pc, moneda, escala)],
    ["Pasivo no corriente", fmtMonto(pnc, moneda, escala)],
    ["Total pasivo", fmtMonto(totalPasivo, moneda, escala)],
    ["Patrimonio", fmtMonto(pat, moneda, escala)],
    ["Utilidad del ejercicio", fmtMonto(ficha.estadoResultados?.utilidad, moneda, escala)],
  ];
}

function balanceDetalleRows(
  ficha: FichaCanonicaDocument,
  moneda: string,
  escala: string
): [string, string, string][] {
  return (ficha.balance?.detalle ?? []).map((d) => [
    d.codigo,
    "—",
    fmtMonto(d.monto, moneda, escala),
  ]);
}

function erDetalleRows(
  ficha: FichaCanonicaDocument,
  moneda: string,
  escala: string
): [string, string, string][] {
  const rows: [string, string, string][] = (ficha.estadoResultados?.detalle ?? []).map((d) => [
    d.codigo,
    "—",
    fmtMonto(d.monto, moneda, escala),
  ]);
  if (ficha.estadoResultados?.utilidad != null) {
    rows.push(["", "Utilidad neta", fmtMonto(ficha.estadoResultados.utilidad, moneda, escala)]);
  }
  return rows;
}

function indicadorRows(
  indicadores: IndicadorCalculadoDocument[],
  moneda: string,
  escala: string
): [string, string, string][] {
  return indicadores.map((i) => [
    indicadorNombre(i.indicadorCodigo),
    i.indicadorCodigo,
    i.calculable
      ? fmtIndicadorValor(i.indicadorCodigo, i.valor, { moneda, escala })
      : `N/C (${i.error ?? "—"})`,
  ]);
}

function renderInconsistenciasTable(rows: [string, string, string][]): string {
  if (!rows.length) {
    return '<p class="empty">Sin inconsistencias críticas o advertencias pendientes.</p>';
  }
  const body = rows
    .map(([tipo, msg, estado]) => {
      const cls =
        tipo.toLowerCase().includes("critical") || tipo.toLowerCase().includes("cuadratura")
          ? "inc-critical"
          : "inc-warning";
      return `<tr class="${cls}"><td>${escapeHtml(tipo)}</td><td>${escapeHtml(msg)}</td><td>${escapeHtml(estado)}</td></tr>`;
    })
    .join("");
  return `<table class="data"><thead><tr><th>Tipo</th><th>Mensaje</th><th>Estado</th></tr></thead><tbody>${body}</tbody></table>`;
}

export type InformeRenderOptions = {
  template?: string;
  estadoInforme?: string;
  resumenEjecutivo?: string;
  apartadoAnalisis?: string;
  apartadoRecomendacion?: string;
};

export async function buildInformeHtml(
  fichaId: string,
  opts: InformeRenderOptions = {}
): Promise<string> {
  const ficha = await FichaCanonicaModel.findById(fichaId);
  if (!ficha) throw new Error("Ficha no encontrada");

  const [caso, indicadores, contrib] = await Promise.all([
    CasoModel.findById(ficha.casoId),
    IndicadorCalculadoModel.find({ fichaId }),
    ficha.contribuyenteId ? ContribuyenteModel.findById(ficha.contribuyenteId) : null,
  ]);
  if (!caso) throw new Error("Caso no encontrado");

  const identidad = await resolveIdentidadInforme(
    ficha.casoId.toString(),
    contrib,
    caso.periodo?.ejercicio
  );

  const moneda = caso.moneda ?? "CLP";
  const escala = caso.escala ?? "miles";

  const [trazRows, incRows] = await Promise.all([
    filasDetalleTrazabilidad(ficha, { moneda, escala }),
    filasInconsistencias(ficha.casoId.toString()),
  ]);

  return renderInformeHtml({
    template: opts.template,
    ficha,
    caso: {
      numero: caso.numero,
      periodo: identidad.ejercicio ?? caso.periodo?.ejercicio,
      moneda: caso.moneda,
      escala: caso.escala,
      semaforo: caso.semaforo,
      confianzaGlobal: caso.confianzaGlobal,
    },
    contrib: {
      razonSocial: identidad.razonSocial,
      rut: identidad.rut,
    },
    indicadores,
    trazRows,
    incRows,
    estadoInforme: opts.estadoInforme ?? "Preliminar",
    resumenEjecutivo: opts.resumenEjecutivo,
    apartadoAnalisis: opts.apartadoAnalisis,
    apartadoRecomendacion: opts.apartadoRecomendacion,
  });
}

export function renderInformeHtml(input: {
  template?: string;
  ficha: FichaCanonicaDocument;
  caso: {
    numero: string;
    periodo?: number | null;
    moneda?: string | null;
    escala?: string | null;
    semaforo?: string | null;
    confianzaGlobal?: number | null;
  };
  contrib?: { razonSocial?: string | null; rut?: string | null };
  indicadores: IndicadorCalculadoDocument[];
  trazRows: [string, string, string][];
  incRows: [string, string, string][];
  estadoInforme: string;
  resumenEjecutivo?: string;
  apartadoAnalisis?: string;
  apartadoRecomendacion?: string;
}): string {
  const tpl = input.template ?? INFORME_HTML_TEMPLATE;
  const moneda = input.caso.moneda ?? "CLP";
  const escala = input.caso.escala ?? "miles";
  const razonSocial = input.contrib?.razonSocial ?? "—";
  const periodo = String(input.caso.periodo ?? "—");
  const kpis = kpiFromIndicadores(input.indicadores, input.ficha, moneda, escala);

  const balanceRows = balanceResumidoRows(input.ficha, moneda, escala);
  const balanceDetalle = balanceDetalleRows(input.ficha, moneda, escala);
  const erRows = erDetalleRows(input.ficha, moneda, escala);

  const placeholders: Record<string, string> = {
    numero_caso: escapeHtml(input.caso.numero),
    contribuyente: escapeHtml(razonSocial),
    rut: escapeHtml(input.contrib?.rut ?? "—"),
    periodo: escapeHtml(periodo),
    moneda: escapeHtml(moneda),
    escala: escapeHtml(escala),
    confianza_pct: input.caso.confianzaGlobal != null ? `${input.caso.confianzaGlobal}%` : "—",
    semaforo_badge: semaforoBadge(input.caso.semaforo ?? input.ficha.validacionesResumen?.semaforo),
    estado_badge: estadoBadge(input.estadoInforme),
    cierre_parcial_banner: cierreParcialBannerHtml(input.ficha),
    resumen_ejecutivo: escapeHtml(
      input.resumenEjecutivo?.trim() ||
        buildResumenEjecutivo({
          razonSocial,
          periodo,
          semaforo: input.caso.semaforo ?? input.ficha.validacionesResumen?.semaforo,
          confianza: input.caso.confianzaGlobal,
          indicadores: input.indicadores,
          moneda,
          escala,
        })
    ),
    tabla_balance: renderTable2(["Concepto", "Monto"], balanceRows, { numericCol: 1 }),
    tabla_balance_detalle: balanceDetalle.length
      ? renderTable3(["Código rubro", "Denominación", "Monto"], balanceDetalle, { numericCol: 2 })
      : '<p class="empty">Sin detalle de balance consolidado.</p>',
    tabla_er: erRows.length
      ? renderTable3(["Código", "Concepto", "Monto"], erRows, { numericCol: 2 })
      : '<p class="empty">Sin detalle de estado de resultados.</p>',
    tabla_indicadores: input.indicadores.length
      ? renderTable3(
          ["Indicador", "Código", "Valor"],
          indicadorRows(input.indicadores, moneda, escala),
          { numericCol: 2 }
        )
      : '<p class="empty">Sin indicadores calculados — recalcule tras aprobar la ficha.</p>',
    tabla_trazabilidad: input.trazRows.length
      ? renderTable3(["Concepto", "Monto", "Origen (documento · pág.)"], input.trazRows, {
          numericCol: 1,
        })
      : '<p class="empty">Sin líneas con trazabilidad documental.</p>',
    tabla_inconsistencias: renderInconsistenciasTable(input.incRows),
    apartado_analisis: proseHtml(input.apartadoAnalisis ?? ""),
    apartado_recomendacion: proseHtml(input.apartadoRecomendacion ?? ""),
    fecha: escapeHtml(new Date().toLocaleString("es-CL")),
    ficha_version: String(input.ficha.version ?? 1),
    estado_informe: escapeHtml(input.estadoInforme),
    ...kpis,
  };

  let html = tpl;
  for (const [key, val] of Object.entries(placeholders)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
  return html;
}

export function buildDemoApartados(input: {
  razonSocial: string;
  numeroCaso: string;
  semaforo: string;
  confianza: number;
  indicadores: IndicadorCalculadoDocument[];
  final: boolean;
  moneda?: string;
  escala?: string;
}): { analisis: string; recomendacion: string } {
  const moneda = input.moneda ?? "CLP";
  const escala = input.escala ?? "miles";
  const map = indicadorMap(input.indicadores);
  const liq = map.get("LIQ_CORRIENTE");
  const end = map.get("END_TOTAL");
  const cap = map.get("CAP_TRABAJO");
  const liqTxt = liq?.calculable ? fmtIndicadorValor("LIQ_CORRIENTE", liq.valor) : "no disponible";
  const endTxt = end?.calculable ? fmtIndicadorValor("END_TOTAL", end.valor) : "no disponible";
  const capTxt =
    cap?.calculable && cap.valor != null
      ? fmtMonto(cap.valor, moneda, escala)
      : "positivo";

  const calidad =
    input.semaforo === "verde"
      ? "La documentación fue procesada con alta confianza y cuadratura verificada."
      : input.semaforo === "rojo"
        ? "Se detectaron diferencias en validaciones que fueron documentadas; se recomienda verificación adicional."
        : "El caso presenta observaciones menores, resueltas en revisión analítica.";

  const analisis =
    `Análisis — ${input.razonSocial} (${input.numeroCaso}). ${calidad} Confianza global del pipeline: ${input.confianza}%.\n\n` +
    `Estructura de corto plazo: liquidez corriente ${liqTxt}, con capital de trabajo ${capTxt}. ` +
    `El endeudamiento total alcanza ${endTxt}, dentro de parámetros habituales para el segmento evaluado. ` +
    `Los montos provienen de la ficha canónica aprobada, con trazabilidad a documento fuente y líneas clasificadas bajo el plan institucional vigente.\n\n` +
    (input.final
      ? "El analista validó apartados manuales y considera la información suficiente para presentación en comité."
      : "Borrador preliminar: completar matices cualitativos antes de marcar como informe final.");

  const recomendacion = input.final
    ? input.semaforo === "rojo"
      ? "Recomendación: someter a comité con reservas. Condicionar avance a aclaración documental y confirmación de totales señalados en validaciones."
      : "Recomendación favorable para presentación en comité de factoring. Proceder con línea sujeta a condiciones estándar de la institución y verificación documental en cierre."
    : "Recomendación preliminar: favorable con observaciones. Confirmar apartados manuales y regenerar export Word antes de marcar el informe como final.";

  return { analisis, recomendacion };
}
