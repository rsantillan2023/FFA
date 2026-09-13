export type ExpedienteOrigen = "casos" | "repositorio" | "flujo" | "dashboard";

const BACK_LINKS: Record<ExpedienteOrigen, { to: string; label: string }> = {
  casos: { to: "/casos", label: "← Bandeja de fichas" },
  repositorio: { to: "/repositorio", label: "← Archivo de fichas aprobadas" },
  flujo: { to: "/flujo", label: "← Mapa del proceso" },
  dashboard: { to: "/", label: "← Panel principal" },
};

export function expedienteBackLink(from?: string | null): { to: string; label: string } {
  if (from && from in BACK_LINKS) {
    return BACK_LINKS[from as ExpedienteOrigen];
  }
  return BACK_LINKS.flujo;
}

export function expedienteFromQuery(origen: ExpedienteOrigen): { from: ExpedienteOrigen } {
  return { from: origen };
}
