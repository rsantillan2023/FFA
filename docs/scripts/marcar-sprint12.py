"""Marca ítems QUÉ Sprint 12 — KPIs U + auditoría P + seguridad S + health."""

import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    # U — KPIs operativos

    ("U.1", "computeKpis tiempoPromedioMinutosAprobacion"),

    ("U.2", "reduccionVsBaselineHorasPct meta 25 min"),

    ("U.3", "pctCuadraturaVerificada"),

    ("U.4", "pctTrazabilidadCompleta"),

    ("U.5", "pctCasosSinIntervencionHumana"),

    ("U.6", "aprendizaje reduccionLineasRevisionPromedioPct"),

    ("U.7", "inconsistenciasConfirmadas KPI"),

    ("U.10", "GET /kpis/export CSV/JSON"),

    ("U.11", "casosPorCanal dashboard"),

    ("U.12", "erroresPorEtapa pipelineErrores"),

    # P — Trazabilidad / auditoría

    ("P.4", "configSnapshot en eventos auditoría"),

    ("P.8", "GET /admin/auditoria filtros fecha/actor/contribuyente"),

    ("P.9", "GET /casos/:id/auditoria/export bundle JSON"),

    ("P.12", "registrarAuditoria config_actualizada PATCH /config"),

    # S — Seguridad

    ("S.4", "Headers seguridad onSend HSTS/nosniff"),

    ("S.5", "ServerSideEncryption AES256 MinIO uploads"),

    ("S.6", "documento_consultado auditoría al abrir file"),

    ("S.10", "smoke.test.ts pruebas API baseline"),

    # O — Operación

    ("O.14", "GET /health/ready mongodb+redis+storage"),

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

