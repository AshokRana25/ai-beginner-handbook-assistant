# Isolated exercise: build beside health_service.py, with no private files.
FROM python:3.13-slim
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser health_service.py ./
USER appuser
EXPOSE 8080
CMD ["python", "health_service.py"]
