# --- stage 1: build the dashboard SPA -------------------------------------
FROM node:22-alpine AS web

WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
COPY web/ ./
# vite.config.ts emits straight into ../app/static → /app/static here
RUN npm run build


# --- stage 2: python service ----------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY --from=web /app/static ./app/static

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
