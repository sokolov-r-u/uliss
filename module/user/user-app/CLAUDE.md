# CLAUDE.md — `user-service`

Guide for `module/user/user-app` (`io.uliss.user_service`, gradle module `:user`). Cross-cutting
rules (workflow, conventions, closed decisions) are in the root `CLAUDE.md` — read that first.
Authentication/JWT — via `:security` (`module/lib/security/CLAUDE.md`).

## User onboarding

Onboarding message system: on first login the user must fill in required fields and can
defer optional ones, so reminders don't repeat. Design:

- **Layers (hexagonal-lite):** transport is thin, logic lives in the domain.
    - `grpc/UserGrpcService` — gRPC adapter (`getUserInfo`): parses the request, delegates, maps errors to
      gRPC `Status` (invalid authId → `INVALID_ARGUMENT`).
    - `controller/ProfileController` — REST adapter; the current user is taken from the JWT claim `userId`
      (`@AuthenticationPrincipal Jwt`). The JWT is validated automatically by the resource server from `:security`.
    - `service/UserProfileService` — `@Transactional` orchestrator: `getOrCreate(authId)` (find-or-create
      profile + seed onboarding), `submit(userId, request)` (apply command + change message status).
    - `service/MessageService` — operations over messages: `seedOnboarding`, `getPending`, `transition`
      (class is `@Transactional(readOnly)`, write methods override it). The transactional boundary is on
      `UserProfileService`; `MessageService` participates in it (+ its own `@Transactional` as defense-in-depth).
- **Commands (Command pattern, `onboarding/`):** `OnboardingCommand{ code; apply(user, request): status }`,
  beans are collected in `UserProfileService` via `associateBy { it.code }`. Each command decides its own
  outcome: filled in → `COMPLETED`, empty → `SKIPPED`; the blocking rule lives inside the command
  (`SetDisplayNameCommand` without `displayName` → `BadRequestException`, not skip). `CompleteProfileCommand`
  writes `birthDate`/`gender`. A new onboarding step = a new `@Component` (the dispatcher/controller stays untouched).
- **Data:** the `profile.messages` catalog (`code`, `blocking`) + the `profile.user_message` join
  (embedded id `user_id`+`message_id`, `status` PENDING→COMPLETED|SKIPPED). The catalog is seeded by Flyway
  (`V4__dml_seed_onboarding_messages.sql`, fixed UUIDs): `SET_DISPLAY_NAME` (blocking) +
  `COMPLETE_PROFILE` (optional: birthDate+gender on one screen). `getPending` — a native query with an
  interface projection `OnboardingMessageView`, blocking first.
- **API:** `GET /user/users/me/onboarding` → list of pending; `POST /user/users/me/onboarding` (204) with
  body `{command, displayName?, birthDate?, gender?}` — the `command` discriminator is **in the body** (not in
  the path), skip = submit `COMPLETE_PROFILE` with empty fields (there's no separate endpoint). The `/user`
  prefix is added by `WebMvcPathPrefixConfig` (see "Path-prefix convention" in the root `CLAUDE.md`) —
  `ProfileController` is declared as `@RequestMapping("/users")`, with no prefix in the class itself.

The web part of onboarding (SPA) — `module/web/CLAUDE.md`.
