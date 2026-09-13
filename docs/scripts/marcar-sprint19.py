"""Marca ítems QUÉ Sprint 19 — cierre software 100%: AD + S + X."""



import json

import subprocess

from pathlib import Path



ROOT = Path(__file__).resolve().parents[2]

AVANCE = ROOT / "docs" / "avance-funcional.json"



ITEMS = [

    ("AD.1", "FichaCanonica modelo institucional + GET /compliance/principios-ffa"),

    ("AD.2", "Umbral/cola revisión — intervención solo excepciones"),

    ("AD.3", "Validaciones contables + pendiente_calidad ilegibles"),

    ("AD.4", "Canales correo IMAP/Mailhog + portal upload"),

    ("AD.5", "extractionProvider intercambiable mock/openai/anthropic"),

    ("AD.6", "Auditoría configSnapshot + versiones ficha/informe"),

    ("S.7", "DEPLOYMENT_MODE + GET /compliance/despliegue S3/Mongo env"),

    ("S.8", "JWT+RBAC + verificarAccesoCaso referente/solo_lectura"),

    ("X.1", "puedeAprobarFicha cuadratura + generarInforme caso aprobado"),

    ("X.2", "Gate rubro obligatorio approve línea + puedeAprobarFicha"),

    ("X.3", "Auditoría linea_corregida/reclasificada antes de aprobar"),

    ("X.4", "Plan cuentas workflow aprobación formal"),

    ("X.5", "PATCH /config umbral sin redeploy"),

    ("X.6", "CriterioAprobadoModel por contribuyenteId"),

    ("X.7", "try/catch por adjunto mailhog+imap ingest"),

    ("X.8", "requiereRevision + filtro revisión excepciones"),

    ("X.9", "configSnapshot classify + plan en ficha"),

    ("X.10", "FichaCanonica canónica vs documento entrada"),

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


