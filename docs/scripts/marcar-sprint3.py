"""Marca ítems QUÉ completados en Sprint 3 (pipeline core)."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

SPRINT3 = [
    ("B.1", "Preprocess detecta tipoDocumento balance_clasificado"),
    ("C.3", "LineaContable denominación, código, monto, página"),
    ("C.5", "Metadata mock razón social, RUT, moneda, escala, período"),
    ("C.6", "Esquema ExtractResult tipado en pipeline"),
    ("C.9", "confianzaExtraccion por línea"),
    ("C.10", "paginaNumero trazabilidad en línea"),
    ("C.16", "Auditoría extraccion_completada"),
    ("C.17", "IExtractionProvider mock intercambiable"),
    ("C.18", "Cola ffa-extract async"),
    ("D.1", "Detect moneda CLP en normalize"),
    ("D.2", "Detect escala miles + multiplier"),
    ("D.5", "montoNormalizado en líneas"),
    ("D.8", "signoAplicado convención signo"),
    ("D.9", "denominacionNormalizada sin perder original"),
    ("D.10", "Caso moneda/escala/periodo actualizados"),
    ("D.16", "montoOriginal + montoNormalizado preservados"),
    ("E.4", "planCuentasVersionId snapshot en caso"),
    ("F.1", "classifyLines asigna rubroInstitucionalId"),
    ("F.2", "Reglas patron_denominacion versionadas"),
    ("F.3", "Fallback match semántico por nombre rubro"),
    ("F.7", "confianzaClasificacion por línea"),
    ("F.8", "requiereRevision bajo umbral"),
    ("F.10", "clasificacionPropuesta en línea"),
    ("F.13", "ReglasClasificacionVersion en MongoDB"),
    ("F.14", "confianzaGlobal agregada en caso"),
    ("F.19", "Auditoría clasificacion_completada"),
    ("H.1", "Validación cuadratura activo=pasivo+patrimonio"),
    ("H.8", "semáforo verde/amarillo/rojo en caso"),
    ("H.10", "ValidacionResultado por regla aplicada"),
    ("H.11", "Mensajes con montos en validación"),
    ("O.2", "Pipeline preprocess→extract→normalize→classify→validate"),
    ("O.9", "procesamiento.etapaActual por etapa"),
    ("O.19", "Auditoría con payload diagnóstico por etapa"),
    ("P.2", "Auditoría decisiones automáticas pipeline"),
    ("P.11", "Eventos recepción→procesamiento→revisión"),
    ("P.14", "Auditoría asociada a casoId"),
    ("Q.3", "Estado pipeline visible en bandeja casos"),
    ("Q.14", "Progreso etapas en detalle caso"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in SPRINT3:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
