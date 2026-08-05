# Onboarding birth-date: manual input + min-age (16) validation

**Date:** 2026-08-05
**Status:** Approved (design)

## Problem

The onboarding "profile" step (`COMPLETE_PROFILE`) collects date of birth through
`NoticeDate`, which today is a **picker-only** control: the `DD / MM / YYYY` segments are
clickable and open a calendar, but the user cannot type the date with the keyboard. On both
desktop and mobile we want the user to be able to **type the date with digits**, while keeping
the calendar available behind a dedicated button.

Additionally there is **no age validation** anywhere: `CompleteProfileCommand` writes whatever
`birthDate` arrives. We must enforce a **minimum age of 16 years**, on both backend (authoritative)
and frontend (instant feedback).

## Goals

- Let the user type the birth date with digits in a single masked field `DD/MM/YYYY`.
- Keep the calendar picker, opened by a dedicated icon-button; typing and picking write one value.
- Enforce **minimum age 16** on the backend as the source of truth.
- Mirror the rule on the frontend for instant feedback (inline error + disabled primary), and in
  the calendar (days newer than "today − 16 years" are non-selectable).
- Keep the field optional/skippable (empty birth date remains valid → `SKIPPED`).

## Non-goals

- No profile-edit screen (onboarding remains the only consumer).
- No change to the gender field, to the command dispatch pattern, or to gRPC.
- No timezone/locale handling beyond the existing local-date-without-shift approach.

## Backend design

### New reusable annotation `@BirthDate` (module `:validation`)

Unlike `@Email` / `@Password` — which are thin wrappers over `@Pattern` (`validatedBy = []`) — an
age rule cannot be expressed as a regex, so `@BirthDate` carries a **custom validator**.

- `io.uliss.validation.annotation.BirthDate`
  - `@Constraint(validatedBy = [BirthDateValidator::class])`
  - `@Target(FIELD, VALUE_PARAMETER)`, `@Retention(RUNTIME)`
  - Attribute `min: Int = 16` (reusable threshold), plus the standard `message` / `groups` /
    `payload`. Default `message` = `BIRTH_DATE_ERROR` message text.
- `io.uliss.validation.validator.BirthDateValidator : ConstraintValidator<BirthDate, LocalDate?>`
  - Reads `min` from the annotation in `initialize`.
  - `isValid(value, ctx)`:
    - `null` → `true` (field is optional — empty birth date is a valid "skip").
    - else → `value <= LocalDate.now().minusYears(min)`. This also rejects future dates
      (a future date is trivially younger than 16).
- `io.uliss.validation.util.Constants.kt`: add `const val MIN_AGE_YEARS = 16` used as the
  annotation attribute default.
- `io.uliss.exception.utils.ErrorCode`: add `const val BIRTH_DATE_ERROR = "BIRTH_DATE_ERROR"`.
  Human-readable message: **"You must be at least 16 years old."** (message string lives with the
  annotation/constants, following the `EMAIL_FORMAT_ERROR` precedent).

### Wiring into the onboarding DTO / controller

- `OnboardingRequest.birthDate` gets `@field:BirthDate`.
  - Note: `OnboardingRequest` is shared across commands, but `@BirthDate` passes on `null`, so
    `SET_DISPLAY_NAME` (which sends `birthDate = null`) is unaffected. An underage date is invalid
    regardless of the command, so global application is acceptable.
- `ProfileController.submitOnboarding`: add `@Valid` (jakarta) on the `@RequestBody` parameter —
  **currently absent**, so bean-validation does not run yet. This is what activates `@BirthDate`.
- `CompleteProfileCommand` is **left unchanged** — validation is a single source on the DTO, not
  duplicated in the command.

### Error surface (already handled)

A violation raises `MethodArgumentNotValidException`, which the existing
`GlobalExceptionHandler.handleMethodArgumentNotValid` maps to **HTTP 400** with body:

```json
{
  "timestamp": "...",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "path": "/users/me/onboarding",
  "details": { "birthDate": "You must be at least 16 years old." }
}
```

No new exception handling required.

`:validation` is already a dependency of `user-app` (brings `spring-boot-starter-validation`
transitively via `api`), so no build changes are needed.

## Frontend design

### `NoticeDate` (`module/web/src/ui/notice/fields.tsx`) rework

Replace the clickable `DD / MM / YYYY` segments with:

- **One masked text input** rendering `DD/MM/YYYY`. Accepts digits only; slashes are inserted
  automatically as the user types (`inputMode="numeric"` for the mobile numeric keyboard). Max 10
  characters. Backspace deletes through separators naturally.
- **A dedicated calendar icon-button** on the right that toggles the existing `DatePicker`. Typing
  and picking write the same underlying value.

New/changed props:

- `value: string | null` — ISO seed (unchanged; used to reflect a picked/typed value).
- `onChange: (result: DateFieldValue) => void` where
  ```ts
  type DateFieldValue =
    | { state: 'empty' }                    // nothing / cleared
    | { state: 'partial' }                  // still typing, incomplete
    | { state: 'invalid' }                  // 10 digits but not a real calendar date
    | { state: 'valid'; iso: string }       // real date (age judged by the parent)
  ```
- `maxDate?: string` — ISO of the latest selectable date; **only constrains the calendar**
  (days after it are dimmed/non-clickable; initial view opens on/at the boundary). Typing is not
  hard-blocked by `maxDate` — an out-of-range typed date still emits `valid`, so the parent can
  show a specific age message rather than silently dropping it.

Responsibilities kept narrow: `NoticeDate` knows only about **format/real-date validity** and a
**generic `maxDate`**; it does not know the "16" business rule. It renders its own inline hint only
for the `invalid` (real-date) case, e.g. "Not a real date".

Parsing rules:

- Buffer holds up to 8 digits → formatted `DD/MM/YYYY`.
- `< 8` digits → `partial` (or `empty` when 0).
- `8` digits → parse day/month/year; verify it is a real calendar date (reject `31/02`,
  `29/02` in non-leap years, month `00`/`13`, day `00`, etc.). Real → `valid` + ISO; not real →
  `invalid`.

### `ProfileStep` (`module/web/src/onboarding/steps.tsx`)

- Compute `maxDate = today − 16 years` (via the shared helper below) and pass it to `NoticeDate`.
- Track the `DateFieldValue` from `NoticeDate`. Derive:
  - `birthDate` (ISO) to submit = the `valid` iso, else `undefined` (empty/partial/invalid → not sent, field is skippable).
  - Age error: when `state === 'valid'` and `iso > maxDate` → show inline error
    "You must be at least 16 years old." and set `primaryDisabled`.
  - When `state === 'invalid'` → primary disabled (a garbage complete date shouldn't submit silently).
  - When `empty`/`partial` → no error, primary enabled (birth date simply not provided).
- Backend remains authoritative: a 400 with the age message is surfaced as the same inline error.

### Shared helper

Small helper (co-located with the onboarding/date code) exposing:

- `minAdultDateIso(min = 16): string` → ISO of `today − min years` (the `maxDate`).
- Reused by `ProfileStep` for both the calendar bound and the front-side age check, so picker and
  validator agree. Keeps the "16" constant in one place on the frontend.

### `onboardingApi.submit` error parsing (`module/web/src/onboarding/onboardingApi.ts`)

Currently on a 4xx the raw response **text** is thrown as the message, which for the new
validation error would be the whole `ErrorResponse` JSON blob. Change `submit` to:

- Try to parse JSON; if it looks like an `ErrorResponse`, extract a human message from
  `details` (join its values, or first value), falling back to `code`, then to raw text, then to a
  generic message.
- This also improves the existing `SET_DISPLAY_NAME` error rendering.

## Testing

**Backend**
- `BirthDateValidator` unit tests: `null` → valid; exactly 16 today → valid (boundary,
  `today.minusYears(16)`); one day short of 16 → invalid; comfortably older → valid; future date →
  invalid.
- Controller/onboarding test: `POST /users/me/onboarding` with `COMPLETE_PROFILE` and an underage
  `birthDate` → 400 with `details.birthDate` message; with a valid adult date → 204 and persisted;
  with `birthDate = null` → 204 (`SKIPPED`).

**Frontend**
- `NoticeDate` parsing: digit-only masking inserts slashes; incomplete → `partial`; `31/02/2000` →
  `invalid`; valid date → `valid` + correct ISO (no TZ shift); calendar disables days after
  `maxDate`.
- `ProfileStep`: underage typed/picked date → inline age error + disabled "Begin"; adult date →
  submits `birthDate`; empty → "Skip"/"Begin" submits without `birthDate`.

(Testing depth follows the repo's current light frontend testing; backend validator gets real unit
tests as it is the authoritative rule.)

## Boundaries summary

| Unit | Responsibility | Knows about "16"? |
|------|----------------|-------------------|
| `@BirthDate` / `BirthDateValidator` (`:validation`) | Reusable min-age rule on a `LocalDate?` | Yes (attribute default) — authoritative |
| `OnboardingRequest` + `@Valid` in controller | Activates validation on the DTO | No |
| `NoticeDate` | Masked input + calendar; format/real-date validity; generic `maxDate` | No |
| `ProfileStep` + FE helper | Min-age rule for instant feedback; passes `maxDate` | Yes (frontend copy) |
| `onboardingApi.submit` | Parse `ErrorResponse` into a human inline message | No |
