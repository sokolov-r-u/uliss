# Uliss design system

`module/lib/uliss-design-system` is both npm package `@uliss/design-system` and Gradle module
`:uliss-design-system`. It is the shared visual source for the React SPA and the authorization server's Thymeleaf pages.

## Two consumers

The npm package exports React/TypeScript source directly from `src/react/index.ts`; Vite transpiles it as part of the
web application. It also exports `src/styles.css` and individual tokens.

The Gradle module runs the npm/PostCSS build and packages processed CSS and fonts beneath `META-INF/resources/ds` in its
jar. Spring Boot then serves those resources under `/ds/**` for auth. Relative font paths must therefore work both from
the source tree in Vite and from the jar resource layout.

The Gradle Node plugin currently downloads the project-pinned Node version declared in `build.gradle.kts`. The npm and
Gradle module versions are independent build metadata; changing either must be an explicit release/versioning task.

## Tokens and themes

`src/styles.css` imports seven token files: colors, typography, spacing, themes, motion, sky, and textures. CSS custom
properties are the shared contract between components and both consumers.

Themes use attributes on the document element:

- `data-ground`: `obsidian` or `void`;
- `data-accent`: `ochre`, `terracotta`, `patina`, or `bone`;
- `data-read`: `compact`, `regular`, `large`, or `larger`;
- `data-surface="login"`: auth-page overrides.

Defaults render correctly without attributes. Auth pins its login surface, while the SPA persists the user's appearance
attributes locally.

Self-hosted Source Serif 4 covers reading and UI text with Latin and Cyrillic subsets. Cinzel is the Latin display face.
Font paths are relative to the token CSS so they resolve identically in Vite and the auth jar.

## React components

Public components are grouped under `src/react/components` and re-exported from `src/react/index.ts`. Every component
has
an adjacent `.prompt.md` containing its variants and usage rules. Read that contract before using or changing the
component, and update it when public behavior changes.

Components use shared tokens and square geometry by default. Circular shapes are intentional local exceptions, not a
general rounding convention.

The visual system originated in an external Claude Design project. That reference is historical provenance, not an
available build input or guaranteed tool. Committed source, tokens, and `.prompt.md` files are authoritative unless an
accessible external reference is supplied.

## Verification

```bash
npm run typecheck -w @uliss/design-system
npm run build -w @uliss/design-system
./gradlew :uliss-design-system:jar
```

When packaging changes, inspect the jar for the expected `META-INF/resources/ds/**` entries. When public components or
tokens change, also build the affected web or auth consumer.
