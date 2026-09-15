import type {
  AuthUser,
  CasoDto,
  CasoEstadoHistorialEntry,
  ConfiguracionSistemaDto,
  ContribuyenteDto,
  DocumentoFuenteDto,
  EliminarDuplicadosLineasResultDto,
  ExtraccionIaTextoDto,
  LineaContableDto,
  ValidacionResultadoDto,
  AuditoriaEventoDto,
  FichaCanonicaDto,
  IndicadorCalculadoDto,
  InformeComiteDto,
  KpisDto,
  RepositorioItemDto,
  HistorialFichaDto,
  ComparacionEjerciciosDto,
  ComparacionCarteraDto,
  CriterioHistoricoDto,
  ConsolidacionGrupoDto,
  ConsolidacionGrupoListItemDto,
  CasoProgresoDto,
  MetricasAprendizajeDto,
  CriterioAplicadoDto,
  UserDto,
  QueueStatusDto,
  AccesoFallidoDto,
  IaLlamadaDto,
  IaLlamadaResumenDto,
  NotificacionLogDto,
  RubroOptionDto,
  LoginResponse,
  PaginatedResponse,
  PlanCuentasVersionDto,
  RubroInstitucionalDto,
  ClasificacionPruebaResultDto,
  ClasificacionIaMasivaResultDto,
  ClasificacionIaProgresoDto,
  SugerenciaClasificacionIaDto,
  BalanceAnalisisDto,
  ReconciliarBalanceResultDto,
  UmbralHistorialDto,
  PlanCuentasHistorialDto,
  BuscarResultDto,
  PipelineEtapaDetalleDto,
  PipelineEtapaDto,
} from "@ffa/shared";

export interface CasoDetalleDto extends CasoDto {
  estadoHistorial: CasoEstadoHistorialEntry[];
  documentos: DocumentoFuenteDto[];
  validaciones?: ValidacionResultadoDto[];
}

const TOKEN_KEY = "ffa_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function casoDocumentoFileUrl(casoId: string, documentoId: string): string {
  return `/api/v1/casos/${casoId}/documentos/${documentoId}/file`;
}

export function casoDocumentoDerivadoUrl(
  casoId: string,
  documentoId: string,
  nombre: string
): string {
  return `/api/v1/casos/${casoId}/documentos/${documentoId}/derivados/${encodeURIComponent(nombre)}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (response.status === 404 && body.error === "Not Found") {
      throw new Error(`Operación no disponible (${path}). Si acaba de actualizar el código, reinicie la API.`);
    }
    throw new Error(body.error ?? body.message ?? `Error ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  me(): Promise<AuthUser> {
    return request<AuthUser>("/api/v1/users/me");
  },
  health(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
  },
  getConfig(): Promise<ConfiguracionSistemaDto> {
    return request<ConfiguracionSistemaDto>("/api/v1/config");
  },
  patchConfig(data: Partial<ConfiguracionSistemaDto>): Promise<ConfiguracionSistemaDto> {
    return request<ConfiguracionSistemaDto>("/api/v1/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  getUmbralHistorial(): Promise<UmbralHistorialDto[]> {
    return request<UmbralHistorialDto[]>("/api/v1/config/umbral/historial");
  },
  listUsers(): Promise<UserDto[]> {
    return request<UserDto[]>("/api/v1/users");
  },
  createUser(data: {
    email: string;
    password: string;
    nombre: string;
    rol: string;
  }): Promise<UserDto> {
    return request<UserDto>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  patchUser(id: string, data: Partial<{ nombre: string; rol: string; activo: boolean }>): Promise<UserDto> {
    return request<UserDto>(`/api/v1/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  getAdminColas(): Promise<QueueStatusDto[]> {
    return request<QueueStatusDto[]>("/api/v1/admin/colas");
  },
  getAccesosFallidos(): Promise<AccesoFallidoDto[]> {
    return request<AccesoFallidoDto[]>("/api/v1/admin/accesos-fallidos");
  },
  reprocesarCaso(casoId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/admin/casos/${casoId}/reprocesar`, {
      method: "POST",
      body: "{}",
    });
  },
  getAdminNotificaciones(): Promise<NotificacionLogDto[]> {
    return request<NotificacionLogDto[]>("/api/v1/admin/notificaciones");
  },
  getIaLlamadas(params?: Record<string, string>): Promise<IaLlamadaDto[]> {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<IaLlamadaDto[]>(`/api/v1/admin/ia-llamadas${qs}`);
  },
  getIaLlamadasResumen(params?: Record<string, string>): Promise<IaLlamadaResumenDto> {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<IaLlamadaResumenDto>(`/api/v1/admin/ia-llamadas/resumen${qs}`);
  },
  iniciarCargaManual(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/iniciar-carga-manual`, {
      method: "POST",
      body: "{}",
    });
  },

  listPlanVersions(): Promise<PlanCuentasVersionDto[]> {
    return request<PlanCuentasVersionDto[]>("/api/v1/plan-cuentas/versions");
  },
  createPlanVersion(version: string, notas?: string): Promise<PlanCuentasVersionDto> {
    return request<PlanCuentasVersionDto>("/api/v1/plan-cuentas/versions", {
      method: "POST",
      body: JSON.stringify({ version, notas }),
    });
  },
  getPlanRubros(versionId: string): Promise<RubroInstitucionalDto[]> {
    return request<RubroInstitucionalDto[]>(`/api/v1/plan-cuentas/versions/${versionId}/rubros`);
  },
  getPlanHistorial(versionId: string): Promise<PlanCuentasHistorialDto[]> {
    return request<PlanCuentasHistorialDto[]>(
      `/api/v1/plan-cuentas/versions/${versionId}/historial`
    );
  },
  importPlanCsv(versionId: string, csv: string): Promise<{ imported: number }> {
    return request<{ imported: number }>(`/api/v1/plan-cuentas/versions/${versionId}/import-csv`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
  },
  solicitarAprobacionPlan(versionId: string): Promise<PlanCuentasVersionDto> {
    return request<PlanCuentasVersionDto>(
      `/api/v1/plan-cuentas/versions/${versionId}/solicitar-aprobacion`,
      { method: "POST", body: "{}" }
    );
  },
  aprobarPlan(versionId: string, comentario?: string): Promise<PlanCuentasVersionDto> {
    return request<PlanCuentasVersionDto>(`/api/v1/plan-cuentas/versions/${versionId}/aprobar`, {
      method: "POST",
      body: JSON.stringify({ comentario }),
    });
  },

  listContribuyentes(q?: string, page = 1, limit = 20): Promise<PaginatedResponse<ContribuyenteDto>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.set("q", q);
    return request<PaginatedResponse<ContribuyenteDto>>(`/api/v1/contribuyentes?${params}`);
  },
  createContribuyente(data: {
    rut?: string;
    razonSocial: string;
    denominacionesAlternativas?: string[];
  }): Promise<ContribuyenteDto> {
    return request<ContribuyenteDto>("/api/v1/contribuyentes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateContribuyente(
    id: string,
    data: Partial<{ rut: string; razonSocial: string; denominacionesAlternativas: string[] }>
  ): Promise<ContribuyenteDto> {
    return request<ContribuyenteDto>(`/api/v1/contribuyentes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  listCasos(
    filters: {
      estado?: string;
      estados?: string[];
      contribuyenteId?: string;
      asignadoA?: string;
      semaforo?: string;
      colaRevision?: boolean;
      pendientesAnalista?: boolean;
      desde?: string;
      hasta?: string;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    } = {},
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<CasoDto>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.estados?.length) params.set("estados", filters.estados.join(","));
    else if (filters.estado) params.set("estado", filters.estado);
    if (filters.contribuyenteId) params.set("contribuyenteId", filters.contribuyenteId);
    if (filters.asignadoA) params.set("asignadoA", filters.asignadoA);
    if (filters.semaforo) params.set("semaforo", filters.semaforo);
    if (filters.colaRevision) params.set("colaRevision", "true");
    if (filters.pendientesAnalista) params.set("pendientesAnalista", "true");
    if (filters.desde) params.set("desde", filters.desde);
    if (filters.hasta) params.set("hasta", filters.hasta);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    return request<PaginatedResponse<CasoDto>>(`/api/v1/casos?${params}`);
  },
  assignCaso(casoId: string, asignadoA: string | null): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/asignar`, {
      method: "PATCH",
      body: JSON.stringify({ asignadoA }),
    });
  },
  buscarGlobal(q: string): Promise<BuscarResultDto> {
    return request<BuscarResultDto>(`/api/v1/buscar?q=${encodeURIComponent(q)}`);
  },
  patchCasoMetadatos(
    casoId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return request(`/api/v1/casos/${casoId}/metadatos`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  reextraerMetadatos(casoId: string): Promise<Record<string, unknown>> {
    return request(`/api/v1/casos/${casoId}/reextraer-metadatos`, {
      method: "POST",
      body: "{}",
    });
  },
  getExtraccionIa(casoId: string): Promise<ExtraccionIaTextoDto> {
    return request<ExtraccionIaTextoDto>(`/api/v1/casos/${casoId}/extraccion-ia`);
  },
  reclasificarValidar(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/reclasificar-validar`, {
      method: "POST",
      body: "{}",
    });
  },
  pausarCaso(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/pausar`, { method: "POST", body: "{}" });
  },
  reanudarCaso(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/reanudar`, { method: "POST", body: "{}" });
  },
  setPrioridadCaso(casoId: string, prioridad: number): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/prioridad`, {
      method: "PATCH",
      body: JSON.stringify({ prioridad }),
    });
  },
  getPipelineEtapas(casoId: string): Promise<PipelineEtapaDto[]> {
    return request<PipelineEtapaDto[]>(`/api/v1/casos/${casoId}/pipeline-etapas`);
  },
  getPipelineEtapaDetalle(casoId: string, etapaId: string): Promise<PipelineEtapaDetalleDto> {
    const params = new URLSearchParams({ etapaId });
    return request<PipelineEtapaDetalleDto>(
      `/api/v1/casos/${casoId}/pipeline-etapas/detalle?${params}`
    );
  },
  patchCasoContribuyente(casoId: string, contribuyenteId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/contribuyente`, {
      method: "PATCH",
      body: JSON.stringify({ contribuyenteId }),
    });
  },
  cancelarCaso(casoId: string, motivo?: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/cancelar`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    });
  },
  archivarCaso(casoId: string, motivo?: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/archivar`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    });
  },
  reabrirCaso(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/reabrir`, { method: "POST", body: "{}" });
  },
  purgaRetencion(): Promise<{ purgados: number }> {
    return request<{ purgados: number }>("/api/v1/admin/purga-retencion", {
      method: "POST",
      body: "{}",
    });
  },
  getCasosConsolidables(casoId: string): Promise<
    Array<{ id: string; numero: string; estado: string; documentosCount: number }>
  > {
    return request(`/api/v1/casos/${casoId}/consolidables`);
  },
  consolidarCaso(
    destinoId: string,
    casoOrigenId: string
  ): Promise<{ documentosMovidos: number; lineasMovidas: number }> {
    return request(`/api/v1/casos/${destinoId}/consolidar`, {
      method: "POST",
      body: JSON.stringify({ casoOrigenId }),
    });
  },
  setPlanResponsable(versionId: string, responsableId: string | null): Promise<PlanCuentasVersionDto> {
    return request<PlanCuentasVersionDto>(`/api/v1/plan-cuentas/versions/${versionId}/responsable`, {
      method: "PATCH",
      body: JSON.stringify({ responsableId }),
    });
  },
  devolverReprocesamiento(casoId: string): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${casoId}/devolver-reprocesamiento`, {
      method: "POST",
      body: "{}",
    });
  },
  reiniciarFojaCero(
    casoId: string,
    opts?: { motivo?: string; reutilizarPreproceso?: boolean } | string
  ): Promise<{
    casoId?: string;
    casoNumero?: string;
    fichaArchivada: boolean;
    informesArchivados: number;
    documentosReencolados: number;
    reutilizoPreproceso?: boolean;
    documentosConPreprocesoReutilizado?: number;
    documentosRepreprocesados?: number;
    caso?: CasoDto;
  }> {
    const body =
      typeof opts === "string"
        ? { motivo: opts }
        : { motivo: opts?.motivo, reutilizarPreproceso: opts?.reutilizarPreproceso };
    return request(`/api/v1/casos/${casoId}/reiniciar-foja-cero`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  confirmValidacion(casoId: string, validacionId: string, confirmada: boolean): Promise<{ id: string }> {
    return request(`/api/v1/casos/${casoId}/validaciones/${validacionId}/confirmar`, {
      method: "PATCH",
      body: JSON.stringify({ confirmada }),
    });
  },
  getFichaHistorial(casoId: string): Promise<import("@ffa/shared").FichaHistorialDto[]> {
    return request(`/api/v1/casos/${casoId}/fichas/historial`);
  },
  getCaso(id: string): Promise<CasoDetalleDto> {
    return request<CasoDetalleDto>(`/api/v1/casos/${id}`);
  },
  getCasoConfianzaResumen(casoId: string): Promise<import("@ffa/shared").ConfianzaResumenDto> {
    return request(`/api/v1/casos/${casoId}/confianza-resumen`);
  },
  patchCaso(
    id: string,
    data: {
      referencia?: string;
      canal?: string;
      observaciones?: string | null;
      prioridad?: number;
      remitenteEmail?: string | null;
    }
  ): Promise<CasoDto> {
    return request<CasoDto>(`/api/v1/casos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  uploadCasos(
    files: FileList | File[],
    referencia: string,
    remitenteEmail?: string
  ): Promise<{ casos: CasoDto[]; loteId: string }> {
    const form = new FormData();
    form.append("referencia", referencia.trim());
    for (const file of files) {
      form.append("files", file);
    }
    if (remitenteEmail) form.append("remitenteEmail", remitenteEmail);
    return request<{ casos: CasoDto[]; loteId: string }>("/api/v1/casos/upload", {
      method: "POST",
      body: form,
    });
  },
  getCasoLineas(casoId: string, soloRevision = false): Promise<LineaContableDto[]> {
    const params = soloRevision ? "?soloRevision=true" : "";
    return request<LineaContableDto[]>(`/api/v1/casos/${casoId}/lineas${params}`);
  },
  async downloadValidacionesExport(casoId: string, format: "csv" | "json" = "csv"): Promise<void> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(
      `/api/v1/casos/${casoId}/validaciones/export?format=${format}`,
      { headers }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `validaciones-${casoId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },
  getCasoRubros(casoId: string): Promise<RubroOptionDto[]> {
    return request<RubroOptionDto[]>(`/api/v1/casos/${casoId}/rubros`);
  },
  patchCasoLinea(
    casoId: string,
    lineaId: string,
    data: Record<string, unknown>
  ): Promise<LineaContableDto> {
    return request<LineaContableDto>(`/api/v1/casos/${casoId}/lineas/${lineaId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deleteCasoLinea(
    casoId: string,
    lineaId: string,
    data?: { eliminarSimilares?: boolean }
  ): Promise<{ eliminadas: number }> {
    return request<{ eliminadas: number }>(`/api/v1/casos/${casoId}/lineas/${lineaId}`, {
      method: "DELETE",
      body: JSON.stringify(data ?? {}),
    });
  },
  eliminarDuplicadosLineas(casoId: string): Promise<EliminarDuplicadosLineasResultDto> {
    return request<EliminarDuplicadosLineasResultDto>(
      `/api/v1/casos/${casoId}/lineas/eliminar-duplicados`,
      { method: "POST", body: "{}" }
    );
  },
  getBalanceAnalisis(
    casoId: string,
    opts?: { paginas?: number[]; diagnosticoIa?: boolean }
  ): Promise<BalanceAnalisisDto> {
    const params = new URLSearchParams();
    if (opts?.paginas?.length) params.set("paginas", opts.paginas.join(","));
    if (opts?.diagnosticoIa) params.set("ia", "1");
    const q = params.toString() ? `?${params.toString()}` : "";
    return request<BalanceAnalisisDto>(`/api/v1/casos/${casoId}/balance/analisis${q}`);
  },
  reconciliarBalance(
    casoId: string,
    opts?: { paginasObjetivo?: number[]; crearAjuste?: boolean }
  ): Promise<ReconciliarBalanceResultDto> {
    return request<ReconciliarBalanceResultDto>(`/api/v1/casos/${casoId}/balance/reconciliar`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    });
  },
  createLineaManual(
    casoId: string,
    data: {
      documentoId: string;
      denominacionOriginal: string;
      montoNormalizado: number;
      rubroInstitucionalId: string;
      paginaNumero?: number;
    }
  ): Promise<LineaContableDto> {
    return request<LineaContableDto>(`/api/v1/casos/${casoId}/lineas/manual`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  approveCasoLinea(casoId: string, lineaId: string): Promise<LineaContableDto> {
    return request<LineaContableDto>(`/api/v1/casos/${casoId}/lineas/${lineaId}/aprobar`, {
      method: "POST",
      body: "{}",
    });
  },
  sugerirClasificacionIa(
    casoId: string,
    lineaId: string
  ): Promise<SugerenciaClasificacionIaDto> {
    return request<SugerenciaClasificacionIaDto>(
      `/api/v1/casos/${casoId}/lineas/${lineaId}/sugerir-ia`,
      { method: "POST", body: "{}" }
    );
  },
  aplicarClasificacionIa(casoId: string, lineaId: string): Promise<LineaContableDto> {
    return request<LineaContableDto>(
      `/api/v1/casos/${casoId}/lineas/${lineaId}/aplicar-ia`,
      { method: "POST", body: "{}" }
    );
  },
  clasificarLineasDudosasIa(casoId: string): Promise<ClasificacionIaMasivaResultDto> {
    return request<ClasificacionIaMasivaResultDto>(
      `/api/v1/casos/${casoId}/lineas/clasificar-ia-dudosas`,
      { method: "POST", body: "{}" }
    );
  },
  getClasificacionIaProgreso(casoId: string): Promise<ClasificacionIaProgresoDto> {
    return request<ClasificacionIaProgresoDto>(
      `/api/v1/casos/${casoId}/lineas/clasificacion-ia/progreso`
    );
  },
  reclasificarMasiva(
    casoId: string,
    data: { lineaOrigenId: string; rubroInstitucionalId: string; motivo?: string }
  ): Promise<{ actualizadas: number }> {
    return request(`/api/v1/casos/${casoId}/lineas/reclasificar-masiva`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  pruebaClasificacion(data: {
    lineas: Array<{ denominacionOriginal: string; montoOriginal?: number }>;
    umbralConfianza?: number;
  }): Promise<ClasificacionPruebaResultDto> {
    return request<ClasificacionPruebaResultDto>("/api/v1/admin/clasificacion/prueba", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getPuedeAprobarFicha(
    casoId: string,
    ignorarValidacionesPendientes = false
  ): Promise<{ ok: boolean; motivos: string[] }> {
    const params = ignorarValidacionesPendientes ? "?ignorarValidacionesPendientes=true" : "";
    return request<{ ok: boolean; motivos: string[] }>(
      `/api/v1/casos/${casoId}/puede-aprobar-ficha${params}`
    );
  },
  resolverPendientesRevision(casoId: string): Promise<import("@ffa/shared").ResolverPendientesRevisionDto> {
    return request<import("@ffa/shared").ResolverPendientesRevisionDto>(
      `/api/v1/casos/${casoId}/resolver-pendientes-revision`,
      { method: "POST", body: "{}" }
    );
  },
  aprobarFicha(
    casoId: string,
    data: {
      version: number;
      observaciones?: string;
      ignorarValidacionesPendientes?: boolean;
      cierreParcial?: boolean;
      motivoCierreParcial?: string;
    }
  ): Promise<FichaCanonicaDto> {
    return request<FichaCanonicaDto>(`/api/v1/casos/${casoId}/aprobar-ficha`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getCasoAuditoria(casoId: string): Promise<AuditoriaEventoDto[]> {
    return request<AuditoriaEventoDto[]>(`/api/v1/casos/${casoId}/auditoria`);
  },

  getFichaByCaso(casoId: string): Promise<FichaCanonicaDto> {
    return request<FichaCanonicaDto>(`/api/v1/fichas/caso/${casoId}`);
  },
  getFicha(id: string): Promise<FichaCanonicaDto> {
    return request<FichaCanonicaDto>(`/api/v1/fichas/${id}`);
  },
  getFichaIndicadores(fichaId: string): Promise<IndicadorCalculadoDto[]> {
    return request<IndicadorCalculadoDto[]>(`/api/v1/fichas/${fichaId}/indicadores`);
  },
  generarInforme(fichaId: string): Promise<InformeComiteDto> {
    return request<InformeComiteDto>(`/api/v1/fichas/${fichaId}/informes`, {
      method: "POST",
      body: "{}",
    });
  },
  getInformeByCaso(casoId: string): Promise<InformeComiteDto> {
    return request<InformeComiteDto>(`/api/v1/informes/caso/${casoId}`);
  },
  patchInformeApartados(
    informeId: string,
    apartados: Record<string, string>
  ): Promise<InformeComiteDto> {
    return request<InformeComiteDto>(`/api/v1/informes/${informeId}/apartados`, {
      method: "PATCH",
      body: JSON.stringify({ apartados }),
    });
  },
  finalizarInforme(informeId: string): Promise<InformeComiteDto> {
    return request<InformeComiteDto>(`/api/v1/informes/${informeId}/finalizar`, {
      method: "POST",
      body: "{}",
    });
  },
  getRepositorio(
    opts?: {
      ejercicio?: number;
      q?: string;
      canal?: string;
      estado?: string;
      contribuyenteId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<PaginatedResponse<RepositorioItemDto>> {
    const params = new URLSearchParams({
      page: String(opts?.page ?? 1),
      limit: String(opts?.limit ?? 20),
    });
    if (opts?.ejercicio) params.set("ejercicio", String(opts.ejercicio));
    if (opts?.q) params.set("q", opts.q);
    if (opts?.canal) params.set("canal", opts.canal);
    if (opts?.estado) params.set("estado", opts.estado);
    if (opts?.contribuyenteId) params.set("contribuyenteId", opts.contribuyenteId);
    return request<PaginatedResponse<RepositorioItemDto>>(`/api/v1/repositorio?${params}`);
  },
  getRepositorioExportUrl(opts?: { q?: string; ejercicio?: number }): string {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.ejercicio) params.set("ejercicio", String(opts.ejercicio));
    const qs = params.toString();
    return `/api/v1/repositorio/export.csv${qs ? `?${qs}` : ""}`;
  },
  getKpis(desde?: string, hasta?: string): Promise<KpisDto> {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const q = params.toString();
    return request<KpisDto>(`/api/v1/kpis${q ? `?${q}` : ""}`);
  },
  async downloadKpisExport(format: "csv" | "json" = "csv"): Promise<void> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/v1/kpis/export?format=${format}`, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen-equipo-ffa.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },
  getHistorialFichas(contribuyenteId: string): Promise<HistorialFichaDto[]> {
    return request<HistorialFichaDto[]>(
      `/api/v1/contribuyentes/${contribuyenteId}/historial-fichas`
    );
  },
  getCriteriosHistoricos(contribuyenteId: string): Promise<CriterioHistoricoDto[]> {
    return request<CriterioHistoricoDto[]>(
      `/api/v1/contribuyentes/${contribuyenteId}/criterios-historicos`
    );
  },
  compararEjercicios(
    contribuyenteId: string,
    fichaActualId: string,
    fichaAnteriorId?: string
  ): Promise<ComparacionEjerciciosDto> {
    const params = new URLSearchParams({ contribuyenteId, fichaActualId });
    if (fichaAnteriorId) params.set("fichaAnteriorId", fichaAnteriorId);
    return request<ComparacionEjerciciosDto>(`/api/v1/comparacion/ejercicios?${params}`);
  },
  compararCartera(fichaIds: string[]): Promise<ComparacionCarteraDto> {
    const params = new URLSearchParams({ fichaIds: fichaIds.join(",") });
    return request<ComparacionCarteraDto>(`/api/v1/comparacion/cartera?${params}`);
  },
  exportInformeDocx(informeId: string): Promise<{ downloadUrl: string }> {
    return request<{ downloadUrl: string }>(`/api/v1/informes/${informeId}/export/docx`, {
      method: "POST",
      body: "{}",
    });
  },
  async fetchInformeHtmlBlobUrl(informeId: string): Promise<string> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/v1/informes/${informeId}/download`, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    return URL.createObjectURL(blob);
  },
  async openInformeHtml(informeId: string): Promise<void> {
    const url = await this.fetchInformeHtmlBlobUrl(informeId);
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  async openInformeDocx(informeId: string): Promise<void> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/v1/informes/${informeId}/download/docx`, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-${informeId}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },
  getCasoProgreso(casoId: string): Promise<CasoProgresoDto> {
    return request<CasoProgresoDto>(`/api/v1/casos/${casoId}/progreso`);
  },
  consolidarGrupo(nombre: string, fichaIds: string[]): Promise<ConsolidacionGrupoDto> {
    return request<ConsolidacionGrupoDto>("/api/v1/consolidacion/grupo", {
      method: "POST",
      body: JSON.stringify({ nombre, fichaIds }),
    });
  },
  listConsolidaciones(page = 1, limit = 20): Promise<PaginatedResponse<ConsolidacionGrupoListItemDto>> {
    return request<PaginatedResponse<ConsolidacionGrupoListItemDto>>(
      `/api/v1/consolidacion/grupos?page=${page}&limit=${limit}`
    );
  },
  getConsolidacionGrupo(id: string): Promise<ConsolidacionGrupoDto> {
    return request<ConsolidacionGrupoDto>(`/api/v1/consolidacion/grupos/${id}`);
  },
  getCriteriosAplicados(casoId: string): Promise<CriterioAplicadoDto[]> {
    return request<CriterioAplicadoDto[]>(`/api/v1/casos/${casoId}/criterios-aplicados`);
  },
  getMetricasAprendizaje(contribuyenteId: string): Promise<MetricasAprendizajeDto> {
    return request<MetricasAprendizajeDto>(
      `/api/v1/contribuyentes/${contribuyenteId}/metricas-aprendizaje`
    );
  },
};
