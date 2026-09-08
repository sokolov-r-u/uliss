# User service

`module/user/user-app` (`:user`, package `io.uliss.user_service`) owns user profiles and onboarding. It exposes
authenticated REST endpoints and an internal gRPC service whose contract lives in `module/user/user-api`.

## Structure

- `grpc/UserGrpcService` parses internal gRPC requests, delegates to the profile service, and maps invalid auth
  identifiers to gRPC status errors.
- `controller/ProfileController` takes the current profile identifier from the validated JWT `userId` claim and exposes
  onboarding operations.
- `service/UserProfileService` is the transactional orchestrator for profile creation and command submission.
- `service/MessageService` seeds, reads, and transitions onboarding messages while participating in the service
  transaction.
- `onboarding/OnboardingCommand` implementations contain step-specific rules and are collected by command code.

The auth service calls `getUserInfo(authId)` during user-token creation. The service finds or creates the profile for
that auth UUID, seeds onboarding messages, and returns profile data used in token claims.

## Onboarding model

The `profile.messages` catalog defines a command code and whether it is blocking. `profile.user_message` records each
user's state with the composite user/message identifier.

Current commands are:

- `SET_DISPLAY_NAME`: blocking; requires a non-empty display name and completes the message.
- `COMPLETE_PROFILE`: optional; stores birth date and gender when supplied, otherwise records the step as skipped.

Pending messages are returned blocking-first. A new step consists of a catalog migration, an `OnboardingCommand`
component, tests, and corresponding client handling; the dispatcher does not require a new conditional branch.

## REST API

Controller mappings are declared below `/users`; `WebMvcPathPrefixConfig` adds `/user` to all REST controllers.

- `GET /user/users/me/onboarding` returns pending onboarding messages.
- `POST /user/users/me/onboarding` accepts `{command, displayName?, birthDate?, gender?}` and returns no content on
  success.

Skipping `COMPLETE_PROFILE` uses the same POST with empty optional fields. There is no separate skip endpoint. The web
implementation is documented in `module/web/README.md` once its migration is complete.

```bash
./gradlew :user:test
./gradlew :user:integrationTest
```

Integration tests require Docker/Testcontainers. Starting the service requires explicit permission.

