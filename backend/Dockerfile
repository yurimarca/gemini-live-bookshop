FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install production dependencies
RUN uv sync --frozen --no-dev

# Copy application source
COPY main.py ./
COPY app/ ./app/

# Run with uvicorn — PORT is set by Cloud Run (default 8080)
CMD uv run uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
