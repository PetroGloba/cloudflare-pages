# Store site (web UI)

Копія **`web/matrix_widget`** на момент створення. Усі адаптації під публічний сайт робляться **тут**; `web/matrix_widget` лишається для Element без змін.

Див. **`/site.md`** у корені репозиторію.

## Що змінилось (site-shell)

- Немає Matrix `WidgetApi` / OpenID handshake; вхід через **cookie-сесію** після **magic link** (`GET /store?t=...` на тому ж origin, що й API).
- **API base:** `resolveApiPath()` — `location.origin`, або `window.__STORE_API_ORIGIN__`, або змінна середовища **`STORE_API_ORIGIN`** / `VITE_STORE_API_ORIGIN` на етапі `npm run build` (див. `esbuild.config.mjs`).
- Тенант: **`?store_bot_id=`** або **`GET /api/public/store-by-host?host=`** (поле `store_bots.site_public_host` у БД після міграції).
- Таби: магазин, промо, відгуки, **контакти** (`GET /api/store/site-contacts`); без topup/account на сайті.
- **Десктоп (від ~48rem):** основна навігація під хедером, нижній таб-бар приховано; ширший контейнер і сітки для міст, позицій і районів — див. `static/style.css`.

## Локальний перегляд статики

```bash
cd web/store_site
npm ci
npm run build
npm run serve
```

Відкрийте в браузері:

- `http://127.0.0.1:4173/index.html?store_bot_id=<ID>`  
  Якщо API на іншому порту — перед підключенням бандла вставте в тимчасовий HTML або консоль:  
  `window.__STORE_API_ORIGIN__ = 'http://127.0.0.1:8000'`  
  і перезавантажте сторінку (краще один **reverse proxy** на один host — див. нижче).

Один ран **`build` + serve`**:

```bash
npm run preview
```

## Рекомендовано: один origin (nginx / Caddy)

Щоб cookie `matrix_store_session` і `credentials: include` працювали без CORS-мук:

- Проксі: `/` → корінь `web/store_site` (зібраний `index.html` + `static/`), `/api/` → `run_webhook`.
- Відкрийте `http://127.0.0.1:<proxy>/index.html?store_bot_id=...`.
- Для входу: спочатку magic link на цей же хост (`/store?t=...`), потім сайт.

### Клієнтський домен (Cloudflare Worker тощо)

Для публічного сайту на окремому домені (значення `store_bots.site_public_host`) проксі на Worker або іншому шарі має пересилати на **той самий хост**, що й `WEBHOOK_BASE_URL` (бекенд aiohttp): шляхи **`/api/*`**, а також **`/store`** і **`/store/`** (magic link і redirect після входу). Інакше посилання з Telegram Store bot (`https://<site_public_host>/store?t=...`) не потрапить на бекенд і сесія не виставиться на потрібному origin.

## Збірка

Артефакт: `static/app.bundle.js` (esbuild, `esbuild.config.mjs`).

## Тести фронту

```bash
npm test
```
