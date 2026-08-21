FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Requirements are copied first so that changing application code does not
# invalidate the cached dependency layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source into a 'backend' package directory.
COPY . ./backend/
RUN touch ./backend/__init__.py

# Persistent storage for the SQLite database and its automatic backups.
# Deliberately still root-owned: switching to a non-root user here would make
# the existing db_data volume unreadable on upgrade.
RUN mkdir -p data/backups

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
