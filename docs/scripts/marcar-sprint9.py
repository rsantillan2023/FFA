"""Marca ítems QUÉ Sprint 9 — extracción LLM, admin R, seguridad S."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # C — Extracción

    ("C.1", "openai-provider visión multimodal imágenes"),

    ("C.2", "extractDocument soporta PDF e imagen vía mimeType"),

    ("C.7", "validateExtractResult + reintento en worker"),

    ("C.8", "Derivación pendiente_calidad tras reintentos"),

    ("C.19", "Reintento backoff en processExtract"),

    ("C.20", "Caso permanece en cola hasta agotar reintentos"),

    # R — Admin

    ("R.1", "CRUD /users AdminUsersView"),

    ("R.2", "PATCH umbral confianza AdminView"),

    ("R.4", "API /reglas/versions CRUD reglas"),

    ("R.7", "PATCH reintentosMaxPorEtapa config"),

    ("R.9", "PATCH acuseCorreoTemplate config"),

    ("R.11", "GET /admin/auditoria"),

    ("R.12", "GET /admin/colas BullMQ"),

    ("R.13", "POST admin/casos/:id/reprocesar"),

    ("R.14", "retencionDias en config schema"),

    # S — Seguridad

    ("S.3", "config/users/reglas solo adminOrPo"),

    ("S.11", "OPENAI_API_KEY env, emailIngesta encryptedPassword schema"),

    ("S.12", "AccesoFallidoModel + GET accesos-fallidos"),

    # E — Plan cuentas

    ("E.2", "Validación rubro pertenece plan del caso"),

    ("E.8", "RubroInstitucional.corriente en seed CSV"),

    ("E.12", "estadoFinanciero por rubro en schema"),

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

