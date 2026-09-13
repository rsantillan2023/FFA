"""Marca ítems QUÉ completados en Sprint 2 (ingesta + storage + cola)."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE = ROOT / "docs" / "avance-funcional.json"

SPRINT2 = [
    ("A.1", "Worker poll Mailhog — ingesta correo mock"),
    ("A.2", "Poll periódico 24/7 en worker"),
    ("A.3", "Detección correos con adjuntos"),
    ("A.4", "Extracción adjuntos a S3"),
    ("A.5", "Metadatos recepción correo en DocumentoFuente"),
    ("A.7", "Portal web carga manual POST /casos/upload"),
    ("A.8", "Multipart múltiples archivos por sesión"),
    ("A.9", "Metadatos portal usuarioId + recepcion.at"),
    ("A.10", "Formatos PDF/JPEG/PNG/WebP"),
    ("A.11", "Rechazo formatos no soportados 400"),
    ("A.12", "Acuse SMTP al remitente correo/portal"),
    ("A.15", "Caso único FFA-YYYY-NNNNN por documento"),
    ("A.16", "Estado inicial recibido + transición en_cola"),
    ("A.17", "Duplicado marca error sin bloquear lote"),
    ("A.22", "Detección duplicado hash SHA256"),
    ("A.23", "Campo canal en Caso y DocumentoFuente"),
    ("A.24", "Worker desacoplado de API interactiva"),
    ("B.1", "Preprocess mock tipoDocumento desconocido"),
    ("B.4", "calidadOrigen nativo/escaneado/degradado"),
    ("B.5", "paginaCount en documento"),
    ("B.9", "Original inmutable en MinIO/S3"),
    ("B.14", "Reintentos BullMQ attempts:3"),
    ("B.15", "Job aislado por documento"),
    ("O.1", "enqueuePreprocess tras upload"),
    ("O.3", "Worker concurrency:3"),
    ("O.5", "API no bloquea — cola async"),
    ("O.6", "Error aislado por caso en upload"),
    ("O.7", "Backoff exponential BullMQ"),
    ("O.9", "procesamiento.etapaActual en documento"),
    ("O.13", "apps/worker separado de API"),
    ("O.15", "Cola Redis persistente"),
    ("O.18", "Upload encola y retorna 201"),
    ("Q.2", "CasosView portal de carga"),
    ("Q.3", "Listado estado caso en bandeja"),
    ("Q.5", "Listado casos recientes GET /casos"),
    ("Q.10", "Mensajes error upload comprensibles"),
    ("T.1", "enviarAcuseRecepcion nodemailer"),
    ("T.7", "NotificacionLogModel registro envíos"),
    ("T.8", "Template acuseCorreoTemplate config"),
    ("AC.1", "Enum CasoEstado completo"),
    ("AC.2", "estadoHistorial con timestamps"),
    ("AC.3", "VALID_TRANSITIONS en caso-service"),
    ("AC.7", "GET /casos/:id historial visible"),
]

avance = json.loads(AVANCE.read_text(encoding="utf-8"))
for item_id, evidencia in SPRINT2:
    if item_id in avance["items"]:
        avance["items"][item_id] = {
            "estado": "ESTA",
            "evidencia": evidencia,
            "fecha": "2026-09-09",
        }

AVANCE.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run(["python", str(ROOT / "docs/scripts/actualizar-cuadro-avance.py")], check=True)
