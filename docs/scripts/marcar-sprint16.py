"""Marca ítems QUÉ Sprint 16 — extracción C + validación D + operación O + búsqueda Q."""



import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # C — Extracción

    ("C.4", "enrichExtractResult totales y encabezados en pipeline"),

    ("C.15", "parseMontoChileno + log normalización CLP"),

    ("C.21", "fixture IFRS ejemplo + mock provider"),

    # D — Validación

    ("D.11", "PATCH /casos/:id/metadatos + UI revisión"),

    ("D.12", "revalidarCaso RUT/razón social vs contribuyente"),

    ("D.18", "regla pasivo+patrimonio mezclados rules-extended"),

    # O — Operación

    ("O.8", "reintentosMaxPorEtapa por etapa en colas API/worker"),

    ("O.10", "asunto notificación auto-aprobación"),

    ("O.11", "procesamientoPausado + assertCasoNoPausado worker"),

    ("O.12", "PATCH prioridad + sort cola por prioridad"),

    ("O.16", "reclasificarValidarCaso sin re-extract"),

    # Q — Búsqueda / ingesta

    ("Q.4", "filtro pendientesAnalista en listado casos"),

    ("Q.6", "GET /buscar global casos/contribuyentes + UI"),

    ("Q.11", "GET /ingesta/email sin cuenta configurada"),

    ("Q.13", "badges pausado/prioridad en CasosView"),

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


