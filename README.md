# portfolio-analytics

Мини-аналитика для персонального сайта (coffee1337.github.io): просмотры страниц,
клики по внешним ссылкам, доскроллы до секций, переключение языка. Без cookies,
без сторонних трекеров, сырые IP не хранятся (только суточный солёный хэш).

Стек: FastAPI + SQLAlchemy + PostgreSQL (Neon). Деплой: Render (free tier).

## Как это работает

```
coffee1337.github.io  ──POST /collect──▶  Render: этот сервис  ──▶  Neon: PostgreSQL
      (beacon, ~1 КБ)                        │
                                           дашборд: https://<service>.onrender.com/
```

Сборка сайта подставляет `VITE_ANALYTICS_URL` и `VITE_ANALYTICS_KEY` — без них
beacon отключён и ничего не отправляет.

## Локальный запуск

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

По умолчанию используется SQLite (`analytics.db`) и auth выключен.
Сгенерировать события для теста:

```bash
curl -s -X POST http://127.0.0.1:8000/collect -H "content-type: application/json" \
  -d '{"key":"portfolio-dev-key","name":"pageview","path":"/"}'
```

## Деплой (Render + Neon, всё бесплатно)

1. **Neon** (https://neon.tech): Create project → скопируй `Connection string`
   (вид `postgresql://user:pass@host/db?sslmode=require`).
2. Залей этот репозиторий на GitHub (`portfolio-analytics`).
3. **Render** (https://render.com): New → **Blueprint** → выбери репозиторий —
   `render.yaml` создаст сервис. В переменных укажи:
   - `DATABASE_URL` — строка из Neon;
   - `SITE_KEY` — придумай публичный ключ (его же подставишь в сборку сайта);
   - `ADMIN_TOKEN` и `VISITOR_SALT` — Render сгенерирует сам.
4. Открой `https://<service>.onrender.com/` — вход по `ADMIN_TOKEN`.
5. В репозитории сайта создай `.env` (в `.gitignore` он уже исключён):

   ```
   VITE_ANALYTICS_URL=https://<service>.onrender.com
   VITE_ANALYTICS_KEY=<SITE_KEY>
   ```

   и собери/задеплой сайт как обычно (`npm run build && npm run deploy`).

## API

| Endpoint | Описание |
| --- | --- |
| `POST /collect` | приём события (`pageview`, `click`, `section`, `lang_switch`, ...) |
| `GET /?days=7` | дашборд (1/7/30/90 дней) |
| `POST /login?token=...` | вход в дашборд (кука на 30 дней) |

## Docker (опционально, для VPS/локального прогона)

```bash
docker build -t portfolio-analytics .
docker run -p 8000:8000 -e DATABASE_URL=... -e SITE_KEY=... -e ADMIN_TOKEN=... portfolio-analytics
```

## Что собирается

- событие: тип, путь, referrer, страна (по заголовку CDN), устройство (по UA);
- посетитель: `sha256(ip + ua + дата + соль)` — обрезан, ротируется раз в сутки,
  IP в чистом виде не сохраняется;
- `Do Not Track` уважается: beacon отключается при `navigator.doNotTrack == "1"`.
