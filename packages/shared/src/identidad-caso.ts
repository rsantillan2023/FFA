export type IdentidadResueltaFuente = "documento" | "contribuyente" | "referencia" | "pendiente";

export type IdentidadResuelta = {
  razonSocial: string;
  rut: string;
  metadataEsDemo: boolean;
  fuente: IdentidadResueltaFuente;
};

const DEMO_RAZONES = [
  "clínica ejemplo spa",
  "clinica ejemplo spa",
  "clínica demo",
  "clinica demo",
];

const DEMO_RUTS = ["76123456-7", "76.123.456-7"];

export function isDemoRazonSocial(value?: string | null): boolean {
  if (!value?.trim()) return false;
  const n = value.trim().toLowerCase();
  return DEMO_RAZONES.some((d) => n === d || n.includes(d));
}

export function isDemoRut(value?: string | null): boolean {
  if (!value?.trim()) return false;
  const n = value.replace(/\./g, "").toUpperCase();
  return DEMO_RUTS.some((d) => n === d.replace(/\./g, "").toUpperCase());
}

export function isDemoExtractIdentity(meta?: {
  razonSocial?: string | null;
  rut?: string | null;
} | null): boolean {
  if (!meta) return false;
  return isDemoRazonSocial(meta.razonSocial) || isDemoRut(meta.rut);
}

/** Convierte la referencia de carga del portal en un nombre de empresa sugerido. */
export function referenciaComoRazonSocial(referencia?: string | null): string | undefined {
  if (!referencia?.trim()) return undefined;
  let s = referencia.trim();
  if (s.includes(" · ")) s = s.split(" · ")[0]!.trim();
  s = s.replace(/^(balance|ficha|informe|ee\.?\s*rr\.?|estado de resultados)\s+/i, "").trim();
  return s.length >= 2 ? s : undefined;
}

export function resolveIdentidadCaso(input: {
  extractMetadata?: { razonSocial?: string | null; rut?: string | null } | null;
  contribuyente?: { razonSocial?: string | null; rut?: string | null } | null;
  referencia?: string | null;
}): IdentidadResuelta {
  const meta = input.extractMetadata;
  const metadataEsDemo = isDemoExtractIdentity(meta);

  const docRazon =
    meta?.razonSocial?.trim() && !isDemoRazonSocial(meta.razonSocial)
      ? meta.razonSocial.trim()
      : undefined;
  const docRut =
    meta?.rut?.trim() && !isDemoRut(meta.rut) ? meta.rut.trim() : undefined;

  const contribRazon = input.contribuyente?.razonSocial?.trim();
  const contribRut = input.contribuyente?.rut?.trim();
  const refRazon = referenciaComoRazonSocial(input.referencia);

  if (docRazon) {
    return {
      razonSocial: docRazon,
      rut: docRut || contribRut || "—",
      metadataEsDemo,
      fuente: "documento",
    };
  }
  if (contribRazon) {
    return {
      razonSocial: contribRazon,
      rut: contribRut || docRut || "—",
      metadataEsDemo,
      fuente: "contribuyente",
    };
  }
  if (refRazon) {
    return {
      razonSocial: refRazon,
      rut: docRut || contribRut || "—",
      metadataEsDemo,
      fuente: "referencia",
    };
  }
  return {
    razonSocial: "",
    rut: docRut || contribRut || "—",
    metadataEsDemo,
    fuente: "pendiente",
  };
}

/** Texto para columna Referencia en bandejas: referencia manual o nombre de empresa. */
export function casoReferenciaGrilla(input: {
  referencia?: string | null;
  contribuyente?: { razonSocial?: string | null } | null;
  identidadResuelta?: IdentidadResuelta | null;
}): string {
  const ref = input.referencia?.trim();
  if (ref) return ref;
  const contrib = input.contribuyente?.razonSocial?.trim();
  if (contrib) return contrib;
  const empresa = input.identidadResuelta?.razonSocial?.trim();
  if (empresa) return empresa;
  return "";
}
