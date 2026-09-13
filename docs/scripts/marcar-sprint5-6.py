"""Marca ítems QUÉ Sprint 5 (ficha/indicadores/informe) + Sprint 6 parcial (repo/KPIs)."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

ITEMS = [
    # Sprint 5 — K Ficha
    ("K.1", "FichaCanonica generada al aprobar"),
    ("K.2", "Balance clasificado en ficha.detalle"),
    ("K.3", "Estado resultados en ficha"),
    ("K.4", "Modelo independiente del PDF origen"),
    ("K.5", "Estados borrador/aprobada en schema"),
    ("K.6", "validacionesResumen en ficha"),
    ("K.7", "Campo version incrementa"),
    ("K.8", "GET /fichas/:id y /fichas/caso/:id"),
    ("K.9", "GET /fichas/:id/export/json"),
    ("K.10", "lineasIds en detalle rubro"),
    ("K.11", "Totales AC/AN/PC/PN/patrimonio"),
    ("K.12", "Convención signo en totales"),
    ("K.14", "observaciones analista en ficha"),
    # L Indicadores
    ("L.1", "computeIndicators mathjs"),
    ("L.2", "Indicador LIQ_CORRIENTE liquidez"),
    ("L.3", "Indicador END_TOTAL endeudamiento"),
    ("L.4", "Indicador MARGEN_BRUTO rentabilidad"),
    ("L.5", "Indicador CAP_TRABAJO capital trabajo"),
    ("L.6", "Indicador COBERTURA_PAT factoring"),
    ("L.7", "IndicadorDefinicionVersion versionada"),
    ("L.8", "definicionVersionId en IndicadorCalculado"),
    ("L.9", "Seed indicadores v1.0.0"),
    ("L.10", "lineasParticipantes en cálculo"),
    ("L.11", "POST recalcular-indicadores"),
    ("L.12", "Indicadores en InformeView"),
    ("L.13", "calculable:false + error si faltan rubros"),
    ("L.14", "GET indicadores por ficha"),
    ("L.15", "Validación obligatorios en finalizar informe"),
    # M Informe
    ("M.1", "PlantillaInformeVersion institucional"),
    ("M.2", "Apartados auto balance/indicadores"),
    ("M.3", "Apartados manuales analisis/recomendacion"),
    ("M.4", "lineasIds trazabilidad en ficha detalle"),
    ("M.5", "tabla_indicadores en HTML"),
    ("M.7", "Plantilla versionada MongoDB"),
    ("M.8", "Seed plantilla v1.0.0"),
    ("M.9", "plantillaVigenteId en config"),
    ("M.10", "Export HTML en S3 + download"),
    ("M.11", "generadoPor/generadoAt/fichaVersion"),
    ("M.13", "Estados borrador/preliminar/final"),
    ("M.14", "Solo caso aprobado genera informe"),
    ("M.15", "Metadatos caso/contribuyente en template"),
    ("M.16", "secciones fija/variable/auto"),
    ("M.17", "PATCH apartadosManuales borrador"),
    ("M.18", "POST finalizar valida obligatorios"),
    ("M.19", "Template HTML estructura comité"),
    # J.22 apartados
    ("J.22", "InformeView editor apartados manuales"),
    # Sprint 6 parcial
    ("N.7", "GET /repositorio listado aprobados"),
    ("N.8", "RepositorioView consulta histórica"),
    ("U.8", "KPI tasaResolucionAutomaticaPct"),
    ("U.9", "GET /kpis dashboard operativo"),
    ("Q.7", "DashboardView KPIs volumen"),
    ("Q.15", "Download informe HTML"),
    ("O.17", "Recalcular indicadores sin pipeline"),
    ("P.5", "definicionVersionId auditoría indicadores"),
    ("P.6", "plantillaVersionId en informe"),
    ("R.5", "IndicadorDefinicionVersion admin seed"),
    ("R.6", "PlantillaInformeVersion admin seed"),
    # Extras pipeline ya cubiertos
    ("C.17", "extractMock intercambiable"),
    ("D.10", "Metadatos caso en normalize"),
    ("F.17", "puedeAprobarFicha bloqueo"),
    ("H.9", "Bloqueo informe si no aprobado"),
    ("AC.4", "aprobar-ficha flujo completo"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in ITEMS:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
