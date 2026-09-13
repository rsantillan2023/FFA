"""Marca ítems QUÉ Sprint 8 — criterios G, consolidación N, progreso Q."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # G — Base de conocimiento / criterios

    ("G.1", "guardarCriterioDesdeLinea al aprobar/corregir"),

    ("G.2", "Criterio: contribuyente + denominación + rubro"),

    ("G.3", "matchCriterioContribuyente en classifyLines"),

    ("G.4", "Criterios específicos por contribuyente"),

    ("G.5", "aprobadoPor y aprobadoAt en schema"),

    ("G.6", "GET criterios-historicos y /criterios"),

    ("G.7", "PATCH criterios version al cambiar rubro"),

    ("G.8", "GET metricas-aprendizaje reducción revisión"),

    ("G.9", "Criterios solo del contribuyente del caso"),

    ("G.10", "Worker classify carga criterios activos"),

    ("G.11", "Upsert criterio en cada corrección validada"),

    ("G.12", "GET casos/:id/criterios-aplicados"),

    ("F.22", "origenClasificacion criterio_contribuyente"),

    # N — Consolidación

    ("N.12", "POST consolidacion/grupo multi-empresa"),

    ("N.15", "ConsolidacionView N empresas × M periodos"),

    ("N.16", "items[] trazabilidad individual por ficha"),

    # O — Análisis grupo

    ("O.3", "totales agregados balance grupo"),

    ("O.4", "indicadoresAgregados promedio cartera"),

    # Q — Progreso UI

    ("Q.14", "GET progreso + SSE stream + barra CasosView"),

    # D — Multi período

    ("D.17", "consolidarGrupo múltiples periodos"),

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

