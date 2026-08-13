# CLAUDE.md — `:security`

Гайд по `module/lib/security` (`io.uliss.security`). Кросс-cutting правила (workflow, конвенции,
closed decisions) — в корневом `CLAUDE.md`, читать сначала его. Здесь — архитектура, специфичная
для этой библиотеки. Auth-сервер как вторая половина того же OAuth-потока — в
`module/auth/CLAUDE.md`.

## Роль

`:security` для каждого зависимого сервиса (`user-service` и будущих) играет **две роли сразу**:

1. **OAuth2 Resource Server** — валидирует JWT по `jwk-set-uri` (`${AUTH_INTERNAL_URL}/oauth2/jwks`).
2. **Auth-посредник** для фронта.

`SecurityConfig` — **STATELESS** (сервис токенов не хранит), `/oauth2/**` — `permitAll`, остальное —
`authenticated`. `:security` также конфигурирует CORS.

**`AuthController` (`/oauth2/**`) + `AuthService`** — тонкий OAuth-клиент, ведущий весь танец за фронт:

- `GET /oauth2/login` — `AuthService` генерирует PKCE `code_verifier`, кладёт его в **cookie**
  `code_verifier` (secure по `AUTH_SECURE_COOKIE`), 302 → `${AUTH_PUBLIC_URL}/oauth2/authorize`
  (browser-facing URL; token/revoke ниже идут на `AUTH_INTERNAL_URL` — см. «Split-horizon auth URL»).
- `POST /oauth2/callback?code` (+ cookie `code_verifier`) — обменивает код на AS `/oauth2/token`
  (confidential: `client_id`+`client_secret`+`code_verifier`), возвращает `TokenResponse` **JSON**.
- `POST /oauth2/refresh` `{refreshToken}` — refresh-grant на AS, возвращает новые токены.
- `POST /oauth2/logout` `{refreshToken}` — отзыв на AS `/oauth2/revoke` (best-effort).
- Все вызовы к AS — `RestClient` с `@Retryable` (ретраи на недоступность AS).

**Полный поток:** браузер → сервис `GET /oauth2/login` → AS `/oauth2/authorize` → логин → AS → SPA
`/callback?code` → SPA `POST` на сервис `/oauth2/callback` (cookie `code_verifier` едет same-origin)
→ JSON-токены. AS редиректит на `${FRONTEND_URL}/callback` (SPA), не на этот сервис.

## Split-horizon auth URL (public vs internal)

Адрес AS расщеплён на **две** переменные, потому что за ingress/gateway браузер и pod достают AS
разными путями (это свойство топологии, не только k8s — тот же приём, что `KC_HOSTNAME` у Keycloak):

- **`AUTH_PUBLIC_URL`** — browser-facing: 302-редирект на `/oauth2/authorize`
  (`AuthService.createLoginRedirectUrl`) + issuer auth-сервера (`app.auth.issuer`). В k8s =
  `http://auth.uliss.local` (через ingress).
- **`AUTH_INTERNAL_URL`** — service-to-service: обмен кода/refresh на `/oauth2/token`,
  `/oauth2/revoke` (`AuthService`), и `jwk-set-uri` resource-server'а. В k8s = `http://auth:9000`
  (cluster-DNS сервиса).

В `:security` это поля `authServerPublicUrl` / `authServerInternalUrl` (`SecurityProperties`), в
yml — `security.oauth2.client.auth-server-public-url` / `-internal-url`. Локально/в Compose обе
равны (`http://auth.uliss.local:9000`) — расщепление «схлопывается». Resource-server issuer **не**
валидирует (только `jwk-set-uri`), поэтому единственное жёсткое требование — `AUTH_INTERNAL_URL`
должен быть доступен из pod'а, а `AUTH_PUBLIC_URL` — из браузера.

## SPA token strategy (решение)

React-SPA (`module/web`) **не общается с auth-сервером напрямую и вообще не знает его адрес.** Она
ходит только в **свой текущий сервис** (`/oauth2/*` из `:security`), а сервис (confidential-клиент +
PKCE) ведёт OAuth-редиректы и отдаёт токены как JSON. Это осознанный выбор — фиксируем, чтобы не
переоткрывать (история решения — в переписке, кратко: сервер токены **не** хранит, потому что
stateless lib-в-каждом-сервисе не может централизованно хранить состояние без общего стора/gateway,
которых пока нет; значит токены держит браузер).

- **Хранение:** оба токена (access + refresh) — в браузере, `sessionStorage` (`auth/tokenStore.ts`
  в `module/web`, чистятся при закрытии вкладки). Сервис — stateless, не хранит ничего.
- **Обновление:** `authFetch` (`auth/apiClient.ts` в `module/web`) обновляет **проактивно** (по
  `expiresAt` со сдвигом `EXPIRY_SKEW_MS`) и **реактивно** (на `401` / `opaqueredirect` от
  entry-point) — шлёт `refreshToken` на `/oauth2/refresh`. Провал refresh → `login()` (full-page на
  `/oauth2/login`).
- **Почему сервис-посредник, а НЕ прямой SPA→AS:** прячет AS от фронта, централизует OAuth в
  `:security`, делает OAuth-клиента confidential (секрет на сервере). XSS-риск при этом **не меньше**
  прямой SPA-модели — refresh всё равно в JS-доступном `sessionStorage`. Ценность посредника —
  инкапсуляция, не защита токенов.
- **Backlog (НЕ делаем сейчас):** **BFF** — сервер держит refresh, в браузер только HttpOnly-cookie
  (устраняет XSS-кражу). Требует **общей точки** (gateway или общий стор типа Redis), т.к. stateless
  lib в N сервисах не может хранить refresh централизованно. До неё известный компромисс — refresh в
  `sessionStorage` (смягчён ротацией + коротким TTL access). `access_token` (JWT) уже валиден во всех
  сервисах без всякого общего кэша — они stateless-валидаторы (общий AS + JWKS).

См. также `module/auth/CLAUDE.md` — вторая половина этого же OAuth-потока (два
`SecurityFilterChain`, сидирование клиентов, `UserService`/JWK, обогащение токена, регистрация,
Auth UI), и `module/web/CLAUDE.md` — как SPA пользуется этим посредником.
