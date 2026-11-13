FROM python:3.12-slim
RUN pip install --no-cache-dir "fastapi>=0.127,<1" "uvicorn>=0.40,<1" "google-auth>=2.40,<3" "requests>=2.32,<3"
COPY main.py .
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
