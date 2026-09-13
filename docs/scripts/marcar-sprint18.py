"""Marca ítems QUÉ Sprint 18 — pipeline AA + contribuyente AB + casos AC + config AE + modelo W + retención S."""



import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    ("AA.1", "GET /casos/:id/pipeline-etapas recepción"),

    ("AA.2", "pipeline-etapas extracción + líneas"),

    ("AA.3", "pipeline-etapas normalización moneda/escala"),

    ("AA.4", "pipeline-etapas clasificación rubros"),

    ("AA.5", "pipeline-etapas validación semáforo"),

    ("AA.6", "pipeline-etapas revisión/ficha"),

    ("AA.7", "pipeline-etapas indicadores calculados"),

    ("AA.8", "pipeline-etapas informe comité"),

    ("AB.3", "auto-vincular contribuyente RUT/razón social en normalize"),

    ("AB.4", "PATCH /casos/:id/contribuyente manual"),

    ("AC.5", "POST /casos/:id/cancelar estado cancelado"),

    ("AC.6", "POST /casos/:id/reabrir rechazado/cancelado"),

    ("AC.8", "filtro listCasos por loteId"),

    ("AE.2", "plantillas solicitar/aprobar + plantillaVigenteId"),

    ("AE.3", "indicadores solicitar/aprobar + indicadoresVigenteId"),

    ("W.2", "DocumentoFuenteModel campos completos"),

    ("W.3", "LineaContableModel trazabilidad y rubro"),

    ("W.5", "FichaCanonicaModel balance/resultados/aprobación"),

    ("W.6", "IndicadorDefinicion + IndicadorCalculado"),

    ("W.7", "CriterioAprobadoModel memoria contribuyente"),

    ("W.8", "AuditoriaEventoModel trazabilidad decisiones"),

    ("W.10", "InformeComiteModel versión/plantilla/estado"),

    ("S.9", "ejecutarPurgaRetencion worker diario + admin POST"),

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


