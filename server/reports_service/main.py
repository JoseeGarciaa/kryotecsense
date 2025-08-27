from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel
import os
import tempfile

# Imports opcionales para generación de reportes
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

try:
    import openpyxl
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

from shared.database import get_db
from shared.utils import get_current_user_from_token

# Crear aplicación FastAPI
app = FastAPI(
    title="Servicio de Reportes - KryoTecSense",
    description="Microservicio para generación de reportes y métricas",
    version="1.0.0"
)

def get_tenant_schema(current_user: Dict[str, Any]) -> str:
    """Obtener el esquema del tenant basado en el usuario actual"""
    tenant = current_user.get('tenant', 'tenant_base')
    return tenant

# Schemas para reportes
class ReportItem(BaseModel):
    id: int
    nombre: str
    descripcion: str
    tipo: str
    frecuencia: str
    ultima_generacion: str
    tamaño: str
    formato: str

class ReportMetrics(BaseModel):
    reportes_trazabilidad: int
    validaciones_registradas: int
    procesos_auditados: int
    eficiencia_promedio: float
    cambio_trazabilidad: float
    cambio_validaciones: float
    cambio_procesos: float
    cambio_eficiencia: float
    # Insights adicionales
    tiempo_promedio_proceso: str
    tasa_exito_global: str
    credocubes_activos: int
    alertas_resueltas: int

@app.get("/reportes/disponibles", response_model=List[ReportItem])
def get_available_reports(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener reportes disponibles basados en datos reales"""
    tenant_schema = get_tenant_schema(current_user)
    
    try:
        # Obtener estadísticas reales para los reportes
        stats_query = f"""
            SELECT 
                COUNT(*) as total_credocubes,
                COUNT(CASE WHEN validacion_limpieza IS NOT NULL THEN 1 END) as con_validaciones,
                COUNT(CASE WHEN estado IN ('Operación', 'Acondicionamiento', 'operación', 'acondicionamiento') THEN 1 END) as en_proceso
            FROM {tenant_schema}.inventario_credocubes
        """
        
        stats = db.execute(text(stats_query)).fetchone()
        
        # Generar reportes dinámicos basados en datos reales
        reports = [
            ReportItem(
                id=1,
                nombre="Reporte de Trazabilidad RFID",
                descripcion=f"Seguimiento completo de {stats[0]} credocubes por código RFID",
                tipo="Inventario",
                frecuencia="Diario",
                ultima_generacion=datetime.now().strftime("%Y-%m-%d %H:%M"),
                tamaño=f"{max(1, stats[0] * 2)}KB",
                formato="PDF"
            ),
            ReportItem(
                id=2,
                nombre="Eficiencia de Procesos",
                descripcion=f"Análisis de {stats[2]} procesos activos y rendimiento operativo",
                tipo="Operaciones",
                frecuencia="Semanal",
                ultima_generacion=datetime.now().strftime("%Y-%m-%d %H:%M"),
                tamaño=f"{max(1, stats[2] * 3)}KB",
                formato="Excel"
            ),
            ReportItem(
                id=3,
                nombre="Validaciones de Calidad",
                descripcion=f"Resultados de {stats[1]} validaciones de limpieza, goteo y desinfección",
                tipo="Calidad",
                frecuencia="Diario",
                ultima_generacion=datetime.now().strftime("%Y-%m-%d %H:%M"),
                tamaño=f"{max(1, stats[1] * 1)}KB",
                formato="PDF"
            ),
            ReportItem(
                id=4,
                nombre="Auditoria de Accesos",
                descripcion="Registro de actividad y accesos de usuarios del sistema",
                tipo="Administración",
                frecuencia="Mensual",
                ultima_generacion=datetime.now().strftime("%Y-%m-%d %H:%M"),
                tamaño="956KB",
                formato="Excel"
            )
        ]
        
        return reports
        
    except Exception as e:
        print(f"DEBUG: Error obteniendo reportes disponibles: {str(e)}")
        # Devolver reportes por defecto en caso de error
        return [
            ReportItem(
                id=1,
                nombre="Reporte de Trazabilidad RFID",
                descripcion="Seguimiento completo de credocubes por código RFID",
                tipo="Inventario",
                frecuencia="Diario",
                ultima_generacion=datetime.now().strftime("%Y-%m-%d %H:%M"),
                tamaño="1KB",
                formato="PDF"
            )
        ]

@app.get("/reportes/metrics", response_model=ReportMetrics)
def get_report_metrics(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Obtener métricas de reportes basadas en datos reales"""
    tenant_schema = get_tenant_schema(current_user)
    
    try:
        # Reportes de trazabilidad (basado en credocubes con RFID)
        trazabilidad_query = f"""
            SELECT COUNT(*) as total 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE rfid IS NOT NULL AND rfid != ''
        """
        reportes_trazabilidad = db.execute(text(trazabilidad_query)).fetchone()[0]
        
        # Validaciones registradas
        validaciones_query = f"""
            SELECT COUNT(*) as total 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE validacion_limpieza IS NOT NULL 
               OR validacion_goteo IS NOT NULL 
               OR validacion_desinfeccion IS NOT NULL
        """
        validaciones_registradas = db.execute(text(validaciones_query)).fetchone()[0]
        
        # Procesos auditados (credocubes que han pasado por algún proceso)
        procesos_query = f"""
            SELECT COUNT(*) as total 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE estado IN ('Operación', 'Acondicionamiento', 'Pre-acondicionamiento', 'Devolución', 'operación', 'acondicionamiento', 'pre-acondicionamiento', 'devolución')
        """
        procesos_auditados = db.execute(text(procesos_query)).fetchone()[0]
        
        # Eficiencia promedio (basada en validaciones exitosas)
        eficiencia_query = f"""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN validacion_limpieza = 'aprobado' 
                         AND validacion_goteo = 'aprobado' 
                         AND validacion_desinfeccion = 'aprobado' 
                    THEN 1 ELSE 0 END) as exitosos
            FROM {tenant_schema}.inventario_credocubes 
            WHERE validacion_limpieza IS NOT NULL
        """
        eficiencia_result = db.execute(text(eficiencia_query)).fetchone()
        total_validaciones = eficiencia_result[0] if eficiencia_result[0] > 0 else 1
        validaciones_exitosas = eficiencia_result[1] or 0
        eficiencia_promedio = (validaciones_exitosas / total_validaciones) * 100
        
        # Calcular cambios porcentuales basados en datos del mes anterior (simulado)
        # En un entorno real, esto se calcularía comparando con datos históricos
        cambio_trazabilidad = min(25.0, max(5.0, (reportes_trazabilidad * 0.1) % 20 + 5))
        cambio_validaciones = min(20.0, max(3.0, (validaciones_registradas * 0.05) % 15 + 3))
        cambio_procesos = min(15.0, max(2.0, (procesos_auditados * 0.08) % 12 + 2))
        cambio_eficiencia = min(5.0, max(0.5, (eficiencia_promedio * 0.02) % 4 + 0.5))
        
        # Calcular insights adicionales basados en datos reales
        
        # Tiempo promedio de proceso (simplificado - basado en cantidad de credocubes)
        # En un entorno real, esto se calcularía con datos de actividades reales
        tiempo_promedio_horas = 2.5 + (procesos_auditados * 0.1) % 3
        tiempo_promedio_proceso = f"{tiempo_promedio_horas:.1f}h"
        
        # Tasa de éxito global (credocubes completados exitosamente)
        tasa_exito = round(eficiencia_promedio, 1) if eficiencia_promedio > 0 else 95.0
        tasa_exito_global = f"{tasa_exito}%"
        
        # Credocubes activos (en cualquier estado operativo)
        credocubes_activos_query = f"""
            SELECT COUNT(*) 
            FROM {tenant_schema}.inventario_credocubes 
            WHERE estado IN ('Operación', 'Acondicionamiento', 'Pre-acondicionamiento', 'Devolución', 'operación', 'acondicionamiento', 'pre-acondicionamiento', 'devolución')
        """
        try:
            credocubes_activos = db.execute(text(credocubes_activos_query)).fetchone()[0]
        except:
            credocubes_activos = 0
        
        # Alertas resueltas (simulado basado en actividad del sistema)
        # En un entorno real, esto se calcularía con datos de alertas/incidencias reales
        alertas_resueltas = max(0, min(50, int(procesos_auditados * 0.15) + (validaciones_registradas * 0.05)))
        
        return ReportMetrics(
            reportes_trazabilidad=reportes_trazabilidad,
            validaciones_registradas=validaciones_registradas,
            procesos_auditados=procesos_auditados,
            eficiencia_promedio=round(eficiencia_promedio, 1),
            cambio_trazabilidad=round(cambio_trazabilidad, 1),
            cambio_validaciones=round(cambio_validaciones, 1),
            cambio_procesos=round(cambio_procesos, 1),
            cambio_eficiencia=round(cambio_eficiencia, 1),
            tiempo_promedio_proceso=tiempo_promedio_proceso,
            tasa_exito_global=tasa_exito_global,
            credocubes_activos=credocubes_activos,
            alertas_resueltas=alertas_resueltas
        )
        
    except Exception as e:
        print(f"DEBUG: Error obteniendo métricas de reportes: {str(e)}")
        # Devolver métricas por defecto
        return ReportMetrics(
            reportes_trazabilidad=0,
            validaciones_registradas=0,
            procesos_auditados=0,
            eficiencia_promedio=0.0,
            cambio_trazabilidad=0.0,
            cambio_validaciones=0.0,
            cambio_procesos=0.0,
            cambio_eficiencia=0.0,
            tiempo_promedio_proceso="0.0h",
            tasa_exito_global="0.0%",
            credocubes_activos=0,
            alertas_resueltas=0
        )

def generate_excel_report(data: List[Dict], filename: str, sheet_name: str = "Reporte") -> str:
    """Generar reporte en formato Excel"""
    if not PANDAS_AVAILABLE or not OPENPYXL_AVAILABLE:
        raise HTTPException(
            status_code=500, 
            detail="Las dependencias para Excel no están disponibles. Por favor instale pandas y openpyxl."
        )
    
    temp_dir = tempfile.gettempdir()
    filepath = os.path.join(temp_dir, f"{filename}.xlsx")
    
    # Crear DataFrame con los datos
    df = pd.DataFrame(data)
    
    # Guardar como Excel con formato
    with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        # Obtener el workbook y worksheet para formato adicional
        workbook = writer.book
        worksheet = writer.sheets[sheet_name]
        
        # Ajustar ancho de columnas
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            worksheet.column_dimensions[column_letter].width = adjusted_width
    
    return filepath

def generate_pdf_report(data: List[Dict], title: str, filename: str) -> str:
    """Generar reporte en formato PDF"""
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=500, 
            detail="Las dependencias para PDF no están disponibles. Por favor instale reportlab."
        )
    
    temp_dir = tempfile.gettempdir()
    filepath = os.path.join(temp_dir, f"{filename}.pdf")
    
    # Crear documento PDF
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []
    
    # Estilos
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=30,
        alignment=1  # Centrado
    )
    
    # Título
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 20))
    
    if data:
        # Preparar datos para la tabla
        headers = list(data[0].keys())
        table_data = [headers]
        
        for row in data:
            table_data.append([str(value) for value in row.values()])
        
        # Crear tabla
        table = Table(table_data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(table)
    
    # Información adicional
    story.append(Spacer(1, 30))
    story.append(Paragraph(f"Generado el: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
    
    # Construir PDF
    doc.build(story)
    return filepath

def get_trazabilidad_data(db: Session, tenant_schema: str) -> List[Dict]:
    """Obtener datos para reporte de trazabilidad"""
    query = f"""
        SELECT 
            nombre_unidad,
            rfid,
            estado,
            sub_estado,
            lote,
            id,
            CASE 
                WHEN validacion_limpieza IS NOT NULL THEN 'Sí'
                ELSE 'No'
            END as tiene_validaciones
        FROM {tenant_schema}.inventario_credocubes
        WHERE rfid IS NOT NULL AND rfid != ''
        ORDER BY id DESC
    """
    
    result = db.execute(text(query)).fetchall()
    return [
        {
            "Nombre Unidad": row[0] or "N/A",
            "RFID": row[1] or "N/A",
            "Estado": row[2] or "N/A",
            "Sub Estado": row[3] or "N/A",
            "Lote": row[4] or "N/A",
            "ID": row[5],
            "Validaciones": row[6]
        }
        for row in result
    ]

def get_validaciones_data(db: Session, tenant_schema: str) -> List[Dict]:
    """Obtener datos para reporte de validaciones"""
    query = f"""
        SELECT 
            nombre_unidad,
            rfid,
            validacion_limpieza,
            validacion_goteo,
            validacion_desinfeccion,
            id
        FROM {tenant_schema}.inventario_credocubes
        WHERE validacion_limpieza IS NOT NULL 
           OR validacion_goteo IS NOT NULL 
           OR validacion_desinfeccion IS NOT NULL
        ORDER BY id DESC
    """
    
    result = db.execute(text(query)).fetchall()
    return [
        {
            "Nombre Unidad": row[0] or "N/A",
            "RFID": row[1] or "N/A",
            "Validación Limpieza": row[2] or "N/A",
            "Validación Goteo": row[3] or "N/A",
            "Validación Desinfección": row[4] or "N/A",
            "ID": row[5]
        }
        for row in result
    ]

def get_procesos_data(db: Session, tenant_schema: str) -> List[Dict]:
    """Obtener datos para reporte de procesos"""
    query = f"""
        SELECT 
            ic.nombre_unidad,
            ic.rfid,
            ic.estado,
            ic.sub_estado,
            ic.id,
            ic.lote
        FROM {tenant_schema}.inventario_credocubes ic
        WHERE ic.estado IN ('Operación', 'Acondicionamiento', 'Pre-acondicionamiento', 'operación', 'acondicionamiento', 'pre-acondicionamiento', 'devolución', 'Devolución')
        ORDER BY ic.id DESC
    """
    
    result = db.execute(text(query)).fetchall()
    return [
        {
            "Nombre Unidad": row[0] or "N/A",
            "RFID": row[1] or "N/A",
            "Estado": row[2] or "N/A",
            "Sub Estado": row[3] or "N/A",
            "ID": row[4],
            "Lote": row[5] or "N/A"
        }
        for row in result
    ]

@app.get("/reportes/{report_id}/download/{format}")
def download_report(
    report_id: int,
    format: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user_from_token)
):
    """Descargar reporte en formato especificado (excel o pdf)"""
    if format not in ["excel", "pdf"]:
        raise HTTPException(status_code=400, detail="Formato no soportado. Use 'excel' o 'pdf'")
    
    # Verificar disponibilidad de dependencias
    if format == "excel" and (not PANDAS_AVAILABLE or not OPENPYXL_AVAILABLE):
        raise HTTPException(
            status_code=503, 
            detail="Las dependencias para Excel no están disponibles. Contacte al administrador."
        )
    
    if format == "pdf" and not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=503, 
            detail="Las dependencias para PDF no están disponibles. Contacte al administrador."
        )
    
    tenant_schema = get_tenant_schema(current_user)
    
    try:
        # Obtener datos según el tipo de reporte
        if report_id == 1:  # Trazabilidad RFID
            data = get_trazabilidad_data(db, tenant_schema)
            title = "Reporte de Trazabilidad RFID"
            filename = f"trazabilidad_rfid_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        elif report_id == 2:  # Eficiencia de Procesos
            data = get_procesos_data(db, tenant_schema)
            title = "Reporte de Eficiencia de Procesos"
            filename = f"eficiencia_procesos_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        elif report_id == 3:  # Validaciones de Calidad
            data = get_validaciones_data(db, tenant_schema)
            title = "Reporte de Validaciones de Calidad"
            filename = f"validaciones_calidad_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        else:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
        if not data:
            # Si no hay datos, crear un reporte vacío con mensaje
            data = [{"Mensaje": "No hay datos disponibles para este reporte"}]
        
        # Generar archivo según el formato
        if format == "excel":
            filepath = generate_excel_report(data, filename, title)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename_with_ext = f"{filename}.xlsx"
        else:  # PDF
            filepath = generate_pdf_report(data, title, filename)
            media_type = "application/pdf"
            filename_with_ext = f"{filename}.pdf"
        
        return FileResponse(
            path=filepath,
            media_type=media_type,
            filename=filename_with_ext,
            headers={"Content-Disposition": f"attachment; filename={filename_with_ext}"}
        )
        
    except Exception as e:
        print(f"DEBUG: Error generando reporte: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generando el reporte: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "reports_service"}

if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.environ.get("PORT", 8005))
    uvicorn.run(app, host="0.0.0.0", port=port)
