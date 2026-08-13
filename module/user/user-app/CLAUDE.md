# CLAUDE.md — `user-service`

Гайд по `module/user/user-app` (`io.uliss.user_service`, gradle-модуль `:user`). Кросс-cutting
правила (workflow, конвенции, closed decisions) — в корневом `CLAUDE.md`, читать сначала его.
Аутентификация/JWT — через `:security` (`module/lib/security/CLAUDE.md`).

## User onboarding

Система онбординг-сообщений: при первом логине пользователь должен заполнить обязательные поля и может
отложить необязательные, чтобы напоминания не повторялись. Устройство:

- **Слои (hexagonal-lite):** транспорт тонкий, логика в домене.
    - `grpc/UserGrpcService` — gRPC-адаптер (`getUserInfo`): парсит запрос, делегирует, мапит ошибки в
      gRPC `Status` (invalid authId → `INVALID_ARGUMENT`).
    - `controller/ProfileController` — REST-адаптер; текущий пользователь берётся из JWT-claim `userId`
      (`@AuthenticationPrincipal Jwt`). JWT валидируется автоматически resource-server'ом из `:security`.
    - `service/UserProfileService` — `@Transactional`-оркестратор: `getOrCreate(authId)` (find-or-create
      профиля + сид онбординга), `submit(userId, request)` (применить команду + сменить статус сообщения).
    - `service/MessageService` — операции над сообщениями: `seedOnboarding`, `getPending`, `transition`
      (класс `@Transactional(readOnly)`, write-методы переопределяют). Транзакционная граница — на
      `UserProfileService`; `MessageService` участвует в ней (+ свой `@Transactional` как defense-in-depth).
- **Команды (паттерн Command, `onboarding/`):** `OnboardingCommand{ code; apply(user, request): status }`,
  бины собираются в `UserProfileService` через `associateBy { it.code }`. Каждая команда сама решает
  исход: заполнено → `COMPLETED`, пусто → `SKIPPED`; blocking-правило внутри команды
  (`SetDisplayNameCommand` без `displayName` → `BadRequestException`, не skip). `CompleteProfileCommand`
  пишет `birthDate`/`gender`. Новый шаг онбординга = новый `@Component` (диспетчер/контроллер не трогаем).
- **Данные:** каталог `profile.messages` (`code`, `blocking`) + связка `profile.user_message`
  (embedded id `user_id`+`message_id`, `status` PENDING→COMPLETED|SKIPPED). Каталог сеется Flyway
  (`V4__dml_seed_onboarding_messages.sql`, фикс. UUID): `SET_DISPLAY_NAME` (blocking) +
  `COMPLETE_PROFILE` (optional: birthDate+gender одним экраном). `getPending` — nativeQuery с
  interface-проекцией `OnboardingMessageView`, blocking первым.
- **API:** `GET /user/users/me/onboarding` → список pending; `POST /user/users/me/onboarding` (204) с
  телом `{command, displayName?, birthDate?, gender?}` — дискриминатор `command` **в теле** (не в
  пути), skip = submit `COMPLETE_PROFILE` с пустыми полями (отдельного endpoint нет). Префикс `/user`
  добавляет `WebMvcPathPrefixConfig` (см. «Path-prefix convention» в корневом `CLAUDE.md`) —
  `ProfileController` объявлен как `@RequestMapping("/users")`, без префикса в самом классе.

Веб-часть онбординга (SPA) — `module/web/CLAUDE.md`.
