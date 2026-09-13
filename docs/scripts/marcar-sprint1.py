"""Marca ítems QUÉ completados en Sprint 1."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

SPRINT1 = [
    ("E.1", "Plan cuentas único — API + model"),
    ("E.3", "Versionado plan cuentas"),
    ("E.4", "Snapshot version en config vigente"),
    ("E.5", "Admin UI plan cuentas"),
    ("E.13", "Export/import CSV rubros"),
    ("E.14", "Import CSV fixtures"),
    ("E.15", "Workflow aprobación formal"),
    ("E.17", "Bloqueo edición versión aprobada"),
    ("AB.1", "POST /contribuyentes"),
    ("AB.2", "denominacionesAlternativas"),
    ("AB.5", "POST merge contribuyentes"),
    ("AB.6", "GET historial casos por contribuyente"),
    ("AB.7", "GET búsqueda contribuyentes"),
    ("AE.1", "Workflow aprobación plan cuentas"),
    ("AE.4", "No editar rubros versión aprobada"),
    ("AE.5", "Registro aprobador en aprobacion"),
    ("AE.6", "GET plan vigente vs histórico"),
    ("I.3", "PATCH /config umbralConfianza"),
    ("R.3", "CRUD plan cuentas versions API"),
    ("R.16", "Import/export CSV configuración rubros"),
    ("W.4", "RubroInstitucional schema"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in SPRINT1:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
