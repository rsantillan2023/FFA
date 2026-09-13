"""Marca ítems QUÉ Sprint 15 — plan de cuentas E + preproceso B."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # E — Plan de cuentas

    ("E.6", "rubros patrimonio 3.3/3.4 en CSV seed"),

    ("E.7", "pasivo no corriente 2.2.x explícito"),

    ("E.9", "convencionSigno en rubro + RubroTree + PATCH"),

    ("E.10", "aliases rubro + match en classify"),

    ("E.11", "reglas notas margen en seed reglas"),

    ("E.16", "PlanCuentasHistorialModel + GET historial"),

    ("E.18", "validatePlanStructure patrimonio/pasivo separados"),

    # B — Preproceso

    ("B.2", "analyzeDocument concatenado/mixto"),

    ("B.3", "rotacionGrados orientación escaneos"),

    ("B.7", "incompleto páginas faltantes flag"),

    ("B.8", "resolucionObjetivo normalización imagen"),

    ("B.10", "derivados miniatura/paginasNormalizadas S3"),

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

