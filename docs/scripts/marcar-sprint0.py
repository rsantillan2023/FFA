"""Marca ítems QUÉ completados en Sprint 0."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

SPRINT0 = [
    ("Q.1", "apps/web — SPA Vue 3 + layout"),
    ("Q.12", "Login JWT + store auth"),
    ("S.1", "POST /auth/login + GET /users/me"),
    ("S.2", "Roles enum + seed admin (RBAC base)"),
    ("R.15", "docker-compose.yml + .env.example"),
    ("W.1", "packages/db contribuyente schema"),
    ("W.9", "packages/db caso schema + CasoEstado enum"),
    ("AC.1", "CasoEstado enum completo en @ffa/shared"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in SPRINT0:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
