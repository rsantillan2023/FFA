"""Marca ítems QUÉ Sprint 7 — comparación histórica + export Word."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # N — Repositorio y comparación

    ("N.1", "FichaCanonica aprobada persistida por contribuyente"),

    ("N.2", "GET historial-fichas ordenado por ejercicio"),

    ("N.3", "Historial incluye todos casos aprobados contribuyente"),

    ("N.4", "GET /comparacion/ejercicios N vs N-1"),

    ("N.5", "GET /comparacion/cartera mismo plan cuentas"),

    ("N.6", "detectarDeterioros liquidez/endeudamiento/semaforo"),

    ("N.9", "GET /repositorio/export.csv"),

    ("N.10", "documentoId y nombre en repositorio"),

    ("N.11", "ComparacionView línea de tiempo"),

    ("N.13", "GET criterios-historicos por contribuyente"),

    ("N.14", "Repositorio excluye rechazados por defecto"),

    ("N.17", "compararCartera casos comparables"),

    # M.10 Word real

    ("M.10", "POST export/docx + download Word S3"),

    ("M.12", "docx con balance e indicadores"),

    # Q — UI repositorio

    ("Q.8", "RepositorioView búsqueda RUT/razón social"),

    ("Q.9", "Export CSV desde repositorio UI"),

    ("Q.10", "Link comparación desde repositorio"),

    # O — análisis

    ("O.1", "Comparación variación balance e indicadores"),

    ("O.2", "Variación pct en metricas comparadas"),

    ("O.5", "Detección deterioro automático"),

    # P — trazabilidad

    ("P.7", "storageKeyDocx en InformeComite"),

    # J — UI informe

    ("J.23", "InformeView botón Descargar Word"),

    # H — filtros repo

    ("H.10", "Filtros repositorio q/ejercicio/canal/estado/fecha"),

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

