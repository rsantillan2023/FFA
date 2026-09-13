"""Marca ítems QUÉ completados en Sprint 4 (estación revisión)."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

SPRINT4 = [
    ("I.1", "Umbral configurable en ConfiguracionSistema"),
    ("I.2", "Default umbral 85% seed"),
    ("I.3", "PATCH /config umbralConfianza AdminView"),
    ("I.5", "requiereRevision en líneas bajo umbral"),
    ("I.8", "confianzaGlobal + confianzaClasificacion por línea"),
    ("I.9", "UI líneas revision highlight + filtro soloRevision"),
    ("I.11", "Auditoría derivación revisión en pipeline"),
    ("J.1", "GET lineas?soloRevision=true"),
    ("J.2", "RevisionSplitView documento + líneas lado a lado"),
    ("J.4", "Navegación páginas PDF pdfjs-dist"),
    ("J.5", "PATCH /casos/:id/lineas/:lid corrección"),
    ("J.6", "POST lineas/:lid/aprobar clasificación propuesta"),
    ("J.7", "PATCH reclasificación rubroInstitucionalId manual"),
    ("J.8", "Auditoría linea_corregida / linea_aprobada"),
    ("J.9", "CriterioAprobado upsert desde corrección"),
    ("J.10", "revalidarCaso tras cada corrección"),
    ("J.11", "Validaciones + semáforo en RevisionView"),
    ("J.12", "POST /aprobar-ficha genera FichaCanonica"),
    ("J.13", "puedeAprobarFicha bloquea pendientes/cuadratura"),
    ("J.19", "Optimistic lock caso.version en PATCH/aprobar"),
    ("J.20", "Observaciones analista en aprobar-ficha"),
    ("J.21", "POST /lineas/manual alta manual"),
    ("J.23", "Filtro solo líneas señaladas en revisión"),
    ("K.8", "GET /casos/:id/ficha FichaCanonicaDto"),
    ("P.3", "Auditoría correcciones con actorId usuario"),
    ("P.10", "GET documento file trazabilidad origen"),
    ("Q.8", "PDF.js + imagen en navegador"),
    ("S.6", "Auditoría documento_consultado al abrir doc"),
    ("E.4", "planCuentasVersionId en ficha aprobada"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in SPRINT4:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
