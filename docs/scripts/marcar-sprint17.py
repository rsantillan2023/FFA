"""Marca ítems QUÉ Sprint 17 — ficha K + informe M + trazabilidad P + admin R."""



import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    ("K.13", "consolidarCasos mismo contribuyente/ejercicio + UI revisión"),

    ("K.15", "assertFichaEditable bloquea edición ficha aprobada"),

    ("M.6", "tabla_inconsistencias en informe HTML/DOCX"),

    ("P.1", "tabla_trazabilidad doc/página por cifra en informe"),

    ("P.13", "gate trazabilidad en puedeAprobarFicha"),

    ("R.10", "politicaIlegible config + preprocess worker"),

    ("R.17", "responsableId plan cuentas + PATCH + UI"),

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


