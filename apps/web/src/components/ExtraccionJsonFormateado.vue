<template>
  <div class="ejf">
    <section v-if="tipoDocumento" class="ejf-block">
      <h3 class="ejf-block__title">Tipo de documento</h3>
      <span class="ejf-badge">{{ tipoDocumento }}</span>
      <span v-if="seccionPagina" class="ejf-badge ejf-badge--muted">{{ seccionPagina }}</span>
    </section>

    <section v-if="metaRows.length" class="ejf-block">
      <h3 class="ejf-block__title">Metadatos</h3>
      <dl class="ejf-dl">
        <div v-for="row in metaRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="encabezados.length" class="ejf-block">
      <h3 class="ejf-block__title">Encabezados</h3>
      <div class="ejf-chips">
        <span v-for="(enc, i) in encabezados" :key="i" class="ejf-chip">{{ enc }}</span>
      </div>
    </section>

    <section v-if="lineas.length" class="ejf-block">
      <h3 class="ejf-block__title">Líneas ({{ lineas.length }})</h3>
      <div class="ejf-table-wrap">
        <table class="ejf-table">
          <thead>
            <tr>
              <th>Pág.</th>
              <th>Código</th>
              <th>Denominación</th>
              <th>Columna</th>
              <th class="ejf-table__num">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(linea, i) in lineas" :key="i">
              <td>{{ linea.pagina ?? "—" }}</td>
              <td>{{ linea.codigo ?? "—" }}</td>
              <td>{{ linea.denominacion }}</td>
              <td>{{ linea.columna ?? "—" }}</td>
              <td class="ejf-table__num">{{ linea.monto }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="totales.length" class="ejf-block">
      <h3 class="ejf-block__title">Totales</h3>
      <div class="ejf-table-wrap">
        <table class="ejf-table">
          <thead>
            <tr>
              <th>Denominación</th>
              <th>Tipo</th>
              <th class="ejf-table__num">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(total, i) in totales" :key="i">
              <td>{{ total.denominacion }}</td>
              <td><span class="ejf-badge ejf-badge--sm">{{ total.tipo }}</span></td>
              <td class="ejf-table__num">{{ total.monto }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="notas.length" class="ejf-block">
      <h3 class="ejf-block__title">Notas</h3>
      <ul class="ejf-notas">
        <li v-for="(nota, i) in notas" :key="i">
          <span v-if="nota.ref" class="ejf-nota-ref">{{ nota.ref }}</span>
          {{ nota.texto }}
        </li>
      </ul>
    </section>

    <section v-if="transcripcion.length" class="ejf-block">
      <h3 class="ejf-block__title">Transcripción por página</h3>
      <details v-for="(pag, i) in transcripcion" :key="i" class="ejf-details" :open="i === 0">
        <summary>Página {{ pag.pagina }}</summary>
        <pre class="ejf-transcripcion">{{ pag.texto }}</pre>
      </details>
    </section>

    <section v-for="extra in extras" :key="extra.key" class="ejf-block">
      <h3 class="ejf-block__title">{{ extra.label }}</h3>
      <pre class="ejf-extra-json">{{ extra.texto }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { fmtMontoExtraccion, parseJsonPayload } from "../utils/parseExtraccionTexto";

const props = defineProps<{
  json: string | null;
}>();

const payload = computed(() => parseJsonPayload(props.json));

const tipoDocumento = computed(() => str(payload.value?.tipoDocumento));
const seccionPagina = computed(() => str(payload.value?.seccionPagina));

const metaRows = computed(() => {
  const meta = payload.value?.metadata;
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    const text = displayValue(value);
    if (text) rows.push({ label, value: text });
  };
  push("Empresa", m.razonSocial);
  push("RUT", m.rut);
  push("Identificador fiscal", m.identificadorFiscal);
  push("País fiscal", m.paisFiscal);
  push("Moneda", m.moneda);
  push("Escala", m.escala);
  push("Factor escala", m.escalaFactor);
  push("Descripción escala", m.descripcionEscala);
  const periodo = m.periodo;
  if (periodo && typeof periodo === "object") {
    const p = periodo as Record<string, unknown>;
    push("Ejercicio", p.ejercicio);
    push("Período desde", p.desde);
    push("Período hasta", p.hasta);
    push("Tipo período", p.tipo);
    if (p.comparativo === true) rows.push({ label: "Comparativo", value: "Sí" });
  }
  return rows;
});

const encabezados = computed(() => stringArray(payload.value?.encabezados));

const lineas = computed(() => {
  const raw = payload.value?.lineas;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const l = item as Record<string, unknown>;
    return {
      pagina: numOrNull(l.paginaNumero),
      codigo: str(l.codigoOrigen) || "—",
      denominacion: str(l.denominacionOriginal) || "—",
      columna: str(l.columnaOrigen) || undefined,
      monto: fmtMontoExtraccion(l.montoOriginal),
    };
  });
});

const totales = computed(() => {
  const raw = payload.value?.totales;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const t = item as Record<string, unknown>;
    return {
      denominacion: str(t.denominacion) || "—",
      tipo: str(t.tipo) || "—",
      monto: fmtMontoExtraccion(t.monto),
    };
  });
});

const notas = computed(() => {
  const raw = payload.value?.notas;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const n = item as Record<string, unknown>;
    return {
      ref: str(n.rubroRef) || undefined,
      texto: str(n.texto) || "—",
    };
  });
});

const transcripcion = computed(() => {
  const fromPages = payload.value?.transcripcionPaginas;
  if (Array.isArray(fromPages) && fromPages.length) {
    return fromPages.map((item) => {
      const t = item as Record<string, unknown>;
      return {
        pagina: numOrNull(t.pagina) ?? "?",
        texto: str(t.texto) || "",
      };
    });
  }
  const textoPagina = str(payload.value?.textoPagina);
  if (textoPagina) return [{ pagina: 1, texto: textoPagina }];
  return [];
});

const EXTRA_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "indicadoresFinancieros", label: "Indicadores financieros" },
  { key: "indicadoresOperativos", label: "Indicadores operativos" },
  { key: "seccionesDetectadas", label: "Secciones detectadas" },
  { key: "inconsistencias", label: "Inconsistencias" },
  { key: "informeExtraccion", label: "Informe de extracción" },
  { key: "paginasClasificadas", label: "Páginas clasificadas" },
  { key: "tiposPorPagina", label: "Tipos por página" },
];

const extras = computed(() => {
  const p = payload.value;
  if (!p) return [];
  return EXTRA_SECTIONS.flatMap(({ key, label }) => {
    const value = p[key];
    if (value == null || (Array.isArray(value) && value.length === 0)) return [];
    try {
      return [{ key, label, texto: JSON.stringify(value, null, 2) }];
    } catch {
      return [];
    }
  });
});

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return fmtMontoExtraccion(value);
  return String(value);
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter(Boolean);
}
</script>

<style scoped>
.ejf {
  display: grid;
  gap: 0.85rem;
}

.ejf-block {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  overflow: hidden;
}

.ejf-block__title {
  margin: 0;
  padding: 0.55rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand-ink, var(--brand));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  border-bottom: 1px solid var(--line);
}

.ejf-badge {
  display: inline-flex;
  margin: 0.65rem 0.65rem 0.65rem 0.85rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--brand) 28%, var(--line));
  color: var(--brand-ink, var(--brand));
}

.ejf-badge--muted {
  background: var(--panel);
  border-color: var(--line);
  color: var(--ink-soft);
  font-weight: 500;
}

.ejf-badge--sm {
  margin: 0;
  font-size: 0.68rem;
  text-transform: uppercase;
}

.ejf-dl {
  margin: 0;
  padding: 0.65rem 0.85rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 0.55rem 1rem;
}

.ejf-dl div {
  min-width: 0;
}

.ejf-dl dt {
  margin: 0 0 0.12rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-faint);
  font-weight: 600;
}

.ejf-dl dd {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--ink);
  word-break: break-word;
}

.ejf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.65rem 0.85rem;
}

.ejf-chip {
  padding: 0.18rem 0.5rem;
  border-radius: 6px;
  font-size: 0.78rem;
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--ink);
}

.ejf-table-wrap {
  overflow: auto;
  max-height: 320px;
}

.ejf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.ejf-table th,
.ejf-table td {
  padding: 0.42rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.ejf-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-faint);
  background: var(--panel);
}

.ejf-table tbody tr:last-child td {
  border-bottom: 0;
}

.ejf-table tbody tr:hover td {
  background: color-mix(in srgb, var(--brand) 4%, var(--panel));
}

.ejf-table__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.ejf-notas {
  margin: 0;
  padding: 0.65rem 0.85rem 0.65rem 1.75rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink);
}

.ejf-nota-ref {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  color: var(--brand-ink, var(--brand));
}

.ejf-details {
  border-top: 1px solid var(--line);
}

.ejf-details:first-of-type {
  border-top: 0;
}

.ejf-details summary {
  padding: 0.5rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--ink);
  background: var(--panel);
}

.ejf-details summary:hover {
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.ejf-transcripcion,
.ejf-extra-json {
  margin: 0;
  padding: 0.75rem 0.85rem;
  font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
  font-size: 0.74rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--ink) 3%, var(--panel));
  border-top: 1px solid var(--line);
}
</style>
