"""Marca ítems QUÉ Sprint 13 — revisión J + umbral I + clasificación F + validación H."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # J — Estación revisión

    ("J.14", "FichaHistorialModel + GET fichas/historial"),

    ("J.15", "POST devolver-reprocesamiento analista"),

    ("J.16", "GET /casos filtros contribuyente/semaforo/cola/fecha"),

    ("J.17", "PATCH /casos/:id/asignar"),

    ("J.18", "calcularTiemposCaso + tiempos en CasoDto"),

    ("J.24", "auditoria informe_apartados_manuales"),

    # I — Umbral

    ("I.4", "umbralAplicado en classify/validate configSnapshot"),

    ("I.6", "confianzaGlobal < umbral → semáforo amarillo"),

    ("I.7", "elegibleAutoAprobacion en validate worker"),

    ("I.10", "finalizarInforme verifica puedeAprobarFicha"),

    # F — Clasificación

    ("F.4", "similitudTexto Levenshtein en matchSemantico"),

    ("F.9", "detectRetiroEnActivo clasificación inconsistente"),

    ("F.15", "candidatos ambiguos → baja confianza"),

    ("F.16", "criterios contribuyente priorizados en classifyLines"),

    ("F.21", "retiros en activo detectRetiroEnActivo"),

    # H — Validación

    ("H.13", "PATCH validaciones confirmar analista"),

    ("H.15", "puedeAprobarFicha inconsistencias sin confirmar"),

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

