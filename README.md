# Store site (web UI)

Копія **`web/matrix_widget`** на момент створення. Усі адаптації під публічний сайт робляться **тут**; `web/matrix_widget` лишається для Element без змін.

Див. **`/site.md`** у корені репозиторію.

## Що змінилось (site-shell)

- Немає Matrix `WidgetApi` / OpenID handshake; сесія — **cookie** після **`POST /api/public/store-site/bootstrap`** на тому ж origin, що й API (гостьовий веб-користувач).
- **API base:** `resolveApiPath()` — `location.origin`, або `window.__STORE_API_ORIGIN__`, або змінна середовища **`STORE_API_ORIGIN`** / `VITE_STORE_API_ORIGIN` на етапі `npm run build` (див. `esbuild.config.mjs`).
- Тенант: **`?store_bot_id=`** або **`GET /api/public/store-by-host?host=`** (поле `store_bots.site_public_host` у БД після міграції).
- Таби: магазин, промо, відгуки, **контакти** (`GET /api/store/site-contacts`); без topup/account на сайті.
- **Десктоп (від ~48rem):** основна навігація під хедером, нижній таб-бар приховано; ширший контейнер і сітки для міст, позицій і районів — див. `static/style.css`.
- **Favicon:** у каталозі `static/` чотири файли `favicon-dark.png`, `favicon-light.png`, `favicon-red.png`, `favicon-green.png` — відповідають `widget_theme` магазину; перемикання в `store-app.js` після bootstrap/`/me`.

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
- Відкрийте `http://127.0.0.1:<proxy>/index.html?store_bot_id=...`. Після завантаження сторінки bootstrap виставить cookie.

### Клієнтський домен (Cloudflare Worker тощо)

Для публічного сайту на окремому домені (значення `store_bots.site_public_host`) проксі на Worker або іншому шарі має пересилати на **той самий хост**, що й `WEBHOOK_BASE_URL` (бекенд aiohttp): шляхи **`/api/*`** та статику сайту (`/`, `/index.html`, `/static/...`). Інакше `POST /api/public/store-site/bootstrap` і подальші **`/api/store/*`** не зможуть виставити сесію на потрібному origin.

## Збірка

Артефакт: `static/app.bundle.js` (esbuild, `esbuild.config.mjs`).

### Cloudflare Pages (клієнтський домен = API на тому ж хості)

Для продакшену, коли браузер звертається до **`https://shop.example.com`** і Worker проксує **`/api/*`** на бекенд на тому ж видимому хості, **не задавайте** у змінних середовища збірки **`STORE_API_ORIGIN`** / **`VITE_STORE_API_ORIGIN`**. Тоді в бандлі лишається порожній базовий URL і `resolveApiPath()` використовує **`location.origin`** — без зайвого хоста API у статичному JS і без роз’їзду cookie/session.

Внутрішні або staging URL не варто прошивати в білд, який деплоїть на публічні домени клієнтів. Локально для розділених портів можна виставити **`window.__STORE_API_ORIGIN__`** (див. вище) або один reverse proxy.

### Заголовки безпеки (CSP)

Файл [**`_headers`**](_headers) застосовується Cloudflare Pages до видачі статики (CSP, `frame-ancestors 'none'`, `Referrer-Policy` тощо). Якщо в консолі браузера з’являються порушення CSP (наприклад, зовнішні шрифти або картинки), розширте відповідну директиву в `_headers`. Дублювати ті самі заголовки можна правилами **Transform Rules** у Cloudflare для зони домену.

## Тести фронту

```bash
npm test
```

## Безпека (коротко)

- **`GET /api/public/store-by-host`** обмежений за IP (налаштування `rate_limit_store_by_host_per_minute` у бекенді).
- **`GET /api/store/custom-buttons`** і **`GET /api/store/site-contacts`** віддають лише URL, пропущені через **`sanitize_store_site_href_url`** (блокуються `javascript:` тощо); на фронті додаткова перевірка перед `href`.
- Усі маршрути **`/api/store/*`**, крім **`/api/store/i18n`**, вимагають валідну сесію (**`matrix_store_auth_middleware`** у [`run_webhook.py`](../../run_webhook.py)).
- Подальше звуження полів у JSON відповідей магазину — ітеративний перегляд [`web/api/store_api.py`](../../web/api/store_api.py) за потреби.
