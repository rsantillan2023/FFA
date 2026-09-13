"""Marca ítems QUÉ Sprint 10 — notificaciones T + ingesta/preproceso B/A."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # T — Notificaciones

    ("T.2", "notificarFalloCalidad extract/preprocess"),

    ("T.3", "notificarRevisionAnalista al validar"),

    ("T.4", "Notificación aprobacion_auto semáforo verde sin revisión"),

    ("T.5", "notificarErrorCritico worker failed handler"),

    ("T.6", "notificacionAnalistas/Admin en config"),

    # A — Ingesta correo

    ("A.6", "loteId compartido adjuntos mismo correo"),

    ("A.13", "Template acuse tono institucional ampliado"),

    ("A.14", "Acuse con {{documento}} y {{estado}}"),

    # B — Preproceso

    ("B.6", "preprocessLog + pagina asociada documento"),

    ("B.11", "preprocessLog[] diagnóstico por documento"),

    ("B.12", "ilegible → pendiente_calidad + notificación"),

    ("B.13", "Política ilegible: notificación + pendiente_calidad"),

    ("B.16", "POST iniciar-carga-manual + RevisionView"),

    # R — Admin correo

    ("R.8", "emailIngesta schema + IMAP poll imap-ingest"),

    ("R.9", "PATCH notificacionFalloTemplate config"),

    # H — Excepciones calidad

    ("H.11", "Estado pendiente_calidad en pipeline"),

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

