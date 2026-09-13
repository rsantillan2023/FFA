"""Marca ítems QUÉ Sprint 14 — clasificación F + validación H + umbral I."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # F — Clasificación

    ("F.5", "resolveAsistida + candidatosAsistidos en classify"),

    ("F.6", "clasificación restringida a rubros plan vigente"),

    ("F.11", "PATCH /casos/:id/lineas/:lid reclasificación manual"),

    ("F.12", "motivo + auditoría linea_reclasificada"),

    ("F.18", "POST /lineas/reclasificar-masiva por denominación"),

    ("F.20", "POST /admin/clasificacion/prueba dry-run"),

    # H — Validación

    ("H.4", "patrimonio/resultado mal ubicado distorsiona indicadores"),

    ("H.17", "subtotales vs componentes en rules-extended"),

    # I — Umbral

    ("I.12", "GET /config/umbral/historial + UI AdminView"),

    ("I.13", "resolucionAutomaticaMensual en KPIs"),

    ("I.14", "tendenciaResolucionAutomaticaPct + criterios en KPIs"),

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

