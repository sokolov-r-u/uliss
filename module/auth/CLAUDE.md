# CLAUDE.md — `auth`

Гайд по `module/auth` (`io.uliss.auth`) — OAuth2 Authorization Server. Кросс-cutting правила
(workflow, конвенции, closed decisions) — в корневом `CLAUDE.md`, читать сначала его. Вторая
половина того же OAuth-потока (resource server + auth-посредник для остальных сервисов) —
`module/lib/security/CLAUDE.md`.

## Auth-сервер

Рантайм-устройство аутентификации (требует чтения нескольких файлов в `module/auth` и `:security`):

- `auth` — OAuth2 Authorization Server с **двумя** `SecurityFilterChain` (`SecurityConfig`):
  `@Order(1)` матчит `/oauth2/**` + `/.well-known/**` (OIDC-эндпоинты, при HTML-запросе редирект
  на `/login`); `@Order(2)` — остальное. На второй цепочке: кастомная `formLogin.loginPage("/login")`
  (отключает дефолтный login-генератор Spring → `GET /login` доходит до `AuthController`),
  `permitAll` для `/login`, `/register`, `/ds/**`, `/error`, и **жадная загрузка CSRF-токена**
  (`CsrfTokenRequestAttributeHandler.setCsrfRequestAttributeName(null)`) — иначе на больших
  страницах с inline-SVG ответ коммитится до рендера формы и ленивый CSRF не успевает создать сессию.
- **Клиенты** хранятся в БД (`JdbcRegisteredClientRepository`, таблицы из
  `V3__ddl_create_spring_auth_tables.sql`) и сеются при старте в `DataInitializer`:
  `uliss-web` — **confidential**-клиент (`CLIENT_SECRET_BASIC`), grants `authorization_code` +
  `refresh_token`, PKCE обязателен (`requireProofKey`, defense-in-depth), scopes `openid profile`,
  redirect на **все** адреса из `AUTH_CLIENT_CALLBACK_URLS` (CSV → несколько `redirectUri`, чтобы
  один клиент работал и локально, и в k8s); TTL — access 15 мин, refresh 30 дней, **ротация**
  (`reuseRefreshTokens=false` → каждый refresh выдаёт новый refresh-токен, старый инвалидируется).
  `DataInitializer` **upsert**: если клиент уже в БД — недостающие redirect-URI дописываются на старте
  (не нужно чистить БД при смене окружения). `uliss-internal` — m2m, `client_secret_basic`, grant
  `client_credentials`, scope `internal`.
  Важно: клиент **не** public — им пользуется **сервис** (`:security`), а не браузер (см. «SPA token
  strategy» в `module/lib/security/CLAUDE.md`), поэтому `REFRESH_TOKEN` grant включён намеренно.
- **Аутентификация пользователей**: `UserService` реализует `UserDetailsService` (поиск по email,
  таблица `auth.users`), пароли — `BCryptPasswordEncoder(strength=12)`. `UserEntity.status` —
  `@Enumerated(EnumType.STRING)` (иначе ordinal нарушает CHECK-констрейнт). JWK-ключи персистятся
  в БД (`SigningKeyEntity` / `SigningKeysService`), выдаются через `/.well-known/jwks.json`.
  **`sub` токена = `auth.users.id` (UUID), а не email** — логин по-прежнему по email
  (`loadUserByUsername(email)`), но `toUserDetails().username(id.toString())` делает именем идентичности
  стабильный UUID (OIDC-корректный subject: email меняется/переназначается, UUID — нет; и не светит PII
  в каждом токене). Email при необходимости добавляется отдельным claim, а не в `sub`.
- **Обогащение access-токена** (`TokenConfig.tokenCustomizer`): в user-токен кладутся claims `roles`,
  `userId` (id профиля в user-service) и `displayName` (если задан). `userId`/`displayName` тянутся
  синхронным gRPC-вызовом `UserService.getUserInfo(authId = sub)` к user-service, который **лениво
  создаёт профиль при первом логине** (find-or-create) и сеет онбординг-сообщения. Недоступность
  user-service → `OAuth2AuthenticationException` (**логин блокируется** — токен без `userId` неполноценен;
  осознанный trade-off: доступность auth завязана на user-service). Для `client_credentials` (m2m) блок
  пропускается — у сервисного токена пользователя нет.
    - **gRPC-транспорт (порт `USER_GRPC_PORT`, отдельный от HTTP `USER_SERVER_PORT`):** auth-клиент —
      `GrpcConfig` (`ManagedChannel`, `usePlaintext`, host `USER_SERVICE_HOST` / port `USER_GRPC_PORT`,
      **без дефолтов** → fail-fast). В k8s `USER_SERVICE_HOST=user` (патч секрета), Service `user` отдаёт
      и `http`, и `grpc`-порт. `spring-boot-starter-grpc-server` при Spring Security на classpath
      **авто-защищает** gRPC как OAuth2 resource-server (требует Bearer); т.к. gRPC — cluster-internal
      (не через ingress) и клиент токен не шлёт, user-service открывает его `permitAll` через
      `GrpcSecurityConfig` (свой `AuthenticationProcessInterceptor` → авто-конфиг отступает по
      `@ConditionalOnMissingBean`). HTTP-security при этом не затронута. Ужесточение (mTLS/m2m) — backlog.
- **Регистрация — только серверная форма** (`AuthController`, `GET`/`POST /register`, DTO
  `RegisterUserRequest(email, password)`); при успехе → `redirect:/login?registered`. REST-эндпоинт
  `/auth/register` удалён намеренно: в Authorization Code + PKCE регистрация хостится на auth-сервере,
  пароль не попадает в SPA. `displayName` в auth **не хранится** — переезжает в `user-service`.
- **Auth-UI** (`AuthController` + Thymeleaf, см. ниже): `/login` и `/register` отдают одну страницу
  с обеими формами и клиентским переключением вкладок (без перезагрузки).

## Auth UI (Thymeleaf)

Серверные страницы входа/регистрации (Фаза B плана выполнена). Устройство:

- **Один шаблон, обе формы.** `GET /login` и `GET /register` (`AuthController`) рендерят
  фрагмент `templates/fragments/layout.html :: page(active)`, где в DOM присутствуют **обе** формы
  (sign-in и register). Активную вкладку задаёт `active` (`signin`/`register`); переключение —
  **на клиенте** (vanilla JS, табы-кнопки `data-tab`, `history.replaceState` меняет URL без
  перезагрузки). `login.html`/`register.html` — тонкие обёртки над фрагментом.
- **Формы реальные:** sign-in `POST /login` (Spring formLogin, поля `username`/`password`),
  register `POST /register` (`th:object="${registerForm}"`, поля `email`/`password`). Объект
  `registerForm` кладётся в модель явно на обоих GET (не через `@ModelAttribute`-метод — иначе
  ломается constructor-binding immutable DTO на POST). SSO/«email sign-in link»/«forgot» —
  визуально неактивны (бэкенд не поддерживает).
- **Разметка вкладок идентична** (кнопки на одной высоте): обе формы — `.auth-body{min-height:404px}`
    + распорка `.spacer{flex:1}`; в register зарезервировано невидимое место под строку «Forgot
      passphrase» из sign-in.
- **Дизайн-система:** CSS-токены DS грузятся через `<link th:href="@{/ds/styles.css}">`; визуал
  (Wordmark-градиент, поля, кнопки, созвездие Orion) — в inline-`<style>` фрагмента поверх токенов.
  Orion — статический SVG-фрагмент `templates/fragments/orion.html` (геометрия перенесена из
  Claude Design `uliss-auth.jsx`). Источник дизайна — проект Claude Design, тянуть через MCP `DesignSync`.
  Общее устройство дизайн-системы — `module/lib/uliss-design-system/CLAUDE.md`.
- **Анти-кэш:** `WebConfig` ставит `Cache-Control: no-store` на `/login` и `/register`
  (`HandlerInterceptor`); `spring.thymeleaf.cache: false` (dev). Хэш-fingerprinting `/ds/**` —
  забота Фазы C (Vite).

См. также `module/lib/security/CLAUDE.md` — resource server + auth-посредник, которым пользуются
остальные сервисы, split-horizon auth URL, SPA token strategy.
