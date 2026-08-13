# CLAUDE.md — `web`

Гайд по `module/web` (`@uliss/web`, React SPA). Кросс-cutting правила (workflow, конвенции, closed
decisions) — в корневом `CLAUDE.md`, читать сначала его. Как SPA получает токены через
сервис-посредник — `module/lib/security/CLAUDE.md` (секция «SPA token strategy»).

## Web SPA (React + Vite)

- npm-пакет `@uliss/web` (член workspace). Стек: React 19, React Router 7, Vite 6 (**без**
  `oidc-client-ts` — вся auth-логика своя), дизайн-система через `@uliss/design-system`
  (`module/lib/uliss-design-system/CLAUDE.md`).
- **Структура `auth/`:** `tokenStore.ts` — токены в `sessionStorage`; `authApi.ts` — вызовы
  сервисных `/oauth2/*` (`login`/`exchangeCode`/`refreshTokens`/`logout`, `returnTo`);
  `apiClient.ts` — `authFetch` (единая точка для защищённых вызовов: Bearer + проактивный/реактивный
  refresh); `AuthContext.tsx` — React-обвязка. `pages/Callback.tsx` — принимает `?code`, POST-ит на
  сервис `/oauth2/callback`, возвращает пользователя на `returnTo` (guard от StrictMode double-invoke).
  `api/users.ts` — `GET /users/me` через `authFetch`; `ui/Shell.tsx` — каркас.
- **Notice-механизм + онбординг (см. «User onboarding · web UI» ниже):** переиспользуемая
  модалка-уведомление поверх затемнённо-размытого приложения. `ui/notice/` — презентация
  (`NoticeOverlay` — portal-backdrop с `backdrop-filter: blur`, `Notice` — карточка с вариантами
  plaque/framed/minimal, `fields.tsx` — controlled поля input/select/date-picker, `glyphs.tsx`);
  `notifications/NotificationProvider.tsx` — очередь generic-уведомлений (`useNotice().notify`);
  `onboarding/` — фича онбординга (`OnboardingDriver` смонтирован в authed-области `App.tsx`).
  Дизайн-источник — Claude Design `uliss-notify.jsx` (MCP `DesignSync`).
- **Same-origin, без URL сервисов в браузере:** все вызовы — **относительные** (`/oauth2/*`, `/users/*`).
  В dev их проксирует Vite (`vite.config.ts`: `/oauth2` и `/users` → `USER_SERVICE_URL`); в prod фронт
  раздаётся за тем же origin, что и сервисы (nginx/gateway). Браузер не знает адрес AS/сервисов.
- **Конфиг через env:** `VITE_*`-переменных для auth **больше нет** (удалены вместе с `oidc.ts`).
  `USER_SERVICE_URL` (**без** `VITE_`-префикса) читает только `vite.config.ts` (node-side, `loadEnv(…, '')`)
  для target dev-прокси — в браузерный бандл она не попадает. Dev-порт `3000` (`strictPort`).
- **Анти-кэш:** плагин `noStoreHtml` шлёт `Cache-Control: no-store` на `index.html` (и в dev, и в
  `vite preview`), хэшированные ассеты `/assets/*` — иммутабельны.

```bash
npm run dev -w @uliss/web        # Vite dev-сервер на :3000
npm run build -w @uliss/web      # tsc --noEmit + vite build
npm run typecheck -w @uliss/web  # tsc --noEmit
```

## User onboarding · web UI

Фронтенд онбординга живёт в SPA и построен на переиспользуемом Notice-механизме (см. выше);
дизайн-источник — Claude Design `uliss-notify.jsx`. Бэкенд онбординга — `module/user/user-app/CLAUDE.md`.

- **`onboarding/OnboardingDriver`** смонтирован в authed-области (`App.tsx`, рядом с `Home`). При
  монтировании тянет `GET /users/me/onboarding` (через `authFetch`) и прогоняет pending-сообщения по
  одному через `NoticeOverlay` (blocking-backdrop поверх `Home`); по опустошению очереди рендерит
  `null` — приложение под ним снова доступно. StrictMode-double-fetch отсекается `useRef`-guard'ом.
- **Шаги (`onboarding/steps.tsx`)** — каждый владеет своим локальным состоянием и сам POST-ит:
  `DisplayNameStep` (`SET_DISPLAY_NAME`, blocking, primary «Continue» дизейблится при пустом поле,
  `400` → inline-ошибка) и `ProfileStep` (`COMPLETE_PROFILE`, пол+дата, primary «Begin» шлёт введённое,
  secondary «Skip» → POST с пустыми полями = `SKIPPED`). `blocking` берётся **из поля `blocking`
  ответа API**, не из мокапа (в дизайне оба экрана blocking, но бэкенд помечает `COMPLETE_PROFILE`
  как optional → у него есть «Skip»).
- **Контракт (`onboarding/onboardingApi.ts`):** `Gender` = `MALE|FEMALE|OTHER`, `birthDate` — ISO
  `YYYY-MM-DD` (date-picker отдаёт локальную дату без TZ-сдвига). Маппинг label↔`Gender` в `steps.tsx`.
- **Профиль пользователя ещё нет UI-экрана** — онбординг это единственный текущий потребитель фичи;
  generic dispatch-уведомления (`kind="info"`) механизм поддерживает, но бэкенд их пока не отдаёт.
