"""Marca ítems QUÉ Sprint 11 — PDF multimodal C + normalización D + validación H + revisión J.3."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # C — Extracción PDF multimodal

    ("C.11", "openai-provider PDF multipágina balance 8 col"),

    ("C.12", "Prompt balance clasificado + merge páginas"),

    ("C.13", "Fixture/mock estado resultados + prompt EERR"),

    ("C.14", "extractNotas en schema + prompt notas"),

    ("C.22", "extractNotas preservadas en documento"),

    # D — Normalización

    ("D.3", "periodo en extractMetadata → caso.periodo"),

    ("D.4", "RUT/razón social extractMetadata → contribuyente"),

    ("D.6", "escala indeterminada → requiereRevision"),

    ("D.7", "evaluarEscala magnitud normalize-metadata"),

    ("D.13", "normalizarPeriodo fechas ISO"),

    ("D.14", "esEjercicioDesactualizado en normalize"),

    ("D.15", "normalizeLog[] en documento"),

    # H — Validación ampliada

    ("H.2", "COHERENCIA_ESTADOS mixto rules-extended"),

    ("H.3", "INTEGRIDAD_AGRUPACION subtotales"),

    ("H.5", "ESCALA_NO_DECLARADA validación"),

    ("H.6", "Detección tipeo denominaciones"),

    ("H.7", "EJERCICIO_DESACTUALIZADO validación"),

    ("H.12", "metadata.origen documento vs sistema"),

    ("H.14", "revalidarCaso en revision.ts"),

    ("H.16", "DEBITO_CREDITO balance 8 col"),

    ("H.18", "GET /casos/:id/validaciones/export"),

    ("H.19", "pct activo mal clasificado"),

    ("H.20", "confianza promedio por línea"),

    # A — Ingesta (complemento Sprint 10)

    ("A.18", "notificarFalloCalidad remitente"),

    ("A.19", "pendiente_calidad sin bloquear cola"),

    ("A.20", "canales correo+portal coexisten"),

    ("A.21", "hash dedup upload vs correo"),

    # J — Revisión

    ("J.3", "RevisionSplitView bbox highlight PDF"),

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

