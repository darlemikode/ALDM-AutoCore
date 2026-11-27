"""OpenTelemetry opcional: mide latencia de cada ruta y de las consultas a la base.
Se activa solo si existe OTEL_EXPORTER_OTLP_ENDPOINT (o APPLICATIONINSIGHTS_CONNECTION_STRING) y están instalados los paquetes
de requirements-telemetria.txt. Sin eso no hace nada ni cambia el arranque."""
import logging
import os

log = logging.getLogger("telemetria")


def activar(app, engine) -> bool:
    cadena_ai = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not (os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or cadena_ai):
        return False
    try:
        if cadena_ai:
            from azure.monitor.opentelemetry import configure_azure_monitor

            configure_azure_monitor(connection_string=cadena_ai)
        else:
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            proveedor = TracerProvider(resource=Resource.create({"service.name": "aldm-autocore-api"}))
            proveedor.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
            trace.set_tracer_provider(proveedor)
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        FastAPIInstrumentor.instrument_app(app, excluded_urls="api/salud,api/health")
        SQLAlchemyInstrumentor().instrument(engine=engine)
        log.info("OpenTelemetry activo")
        return True
    except Exception as exc:  # noqa: BLE001 — la telemetría nunca debe tumbar el servidor
        log.warning("OpenTelemetry no se pudo activar: %s", exc)
        return False
