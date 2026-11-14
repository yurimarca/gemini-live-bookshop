FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1
WORKDIR /app
RUN pip install --no-cache-dir uv

# Dependencies first, for layer caching. The catalog is never baked into the image:
# it comes from Firestore and the Cloud Storage index at startup.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY main.py ./
COPY app/ ./app/
# COPY keeps host file modes; a 0600 source file would be unreadable to the non-root user.
RUN chmod -R a+rX /app

RUN useradd --create-home --uid 10001 gateway
USER gateway
ENV PATH="/app/.venv/bin:$PATH"

# One worker: live sessions hold in-memory state, and Cloud Run scales by instance.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --ws-max-size 131072 --no-server-header"]
