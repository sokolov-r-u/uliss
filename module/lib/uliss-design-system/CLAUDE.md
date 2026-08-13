# CLAUDE.md — `:uliss-design-system`

Гайд по `module/lib/uliss-design-system` (`@uliss/design-system`). Кросс-cutting правила (workflow,
конвенции, closed decisions) — в корневом `CLAUDE.md`, читать сначала его. Использование в
Thymeleaf-страницах `auth` — `module/auth/CLAUDE.md` (секция «Auth UI»). Использование в SPA —
`module/web/CLAUDE.md`.

## Frontend / design system

`uliss-design-system` обслуживает два мира из одного исходника `src/` (один источник, два потребителя):

- **npm-пакет `@uliss/design-system`** — член npm-workspace (корневой `package.json`,
  `workspaces: ["module/lib/uliss-design-system", "module/web"]`). React/Vite-приложение
  (`module/web`): импорт `@uliss/design-system/styles.css` и `.tsx`-компонентов через
  workspace-симлинк. Компоненты **не собираются** — `exports."."` указывает прямо на исходник
  `./src/react/index.ts` (транспилирует Vite). `npm run build` = postcss с **autoprefixer по-файлово**
  в `dist/` (структура сохраняется, без инлайна `@import`).
- **Gradle-модуль `:uliss-design-system`** (`build.gradle.kts`: `java-library` + плагин
  `com.github.node-gradle.node`, алиас `libs.plugins.node`) запускает npm-сборку через Gradle и
  пакует `dist/**` + `src/fonts/**` + `src/assets/**` в jar под `META-INF/resources/ds/`.
  `auth` подключает его обычной зависимостью `implementation(project(":uliss-design-system"))` →
  Spring Boot отдаёт `/ds/**` из classpath jar-а автоматически (webjar-подобный паттерн, без
  копирующих задач). CSS грузится как `/ds/styles.css` (он `@import`-ит токены — это не плоский
  бандл), шрифты — `/ds/fonts/*`, ассеты — `/ds/assets/*`. `@font-face` в `tokens/typography.css` ссылается на
  `../fonts/*.woff2` —
  относительный путь резолвится одинаково в jar (`/ds/tokens/` → `/ds/fonts/`) и в Vite.
- `node { download = false }` — Gradle использует системный Node/npm; для CI без Node поставить `true`.
- Шрифты self-host (OFL 1.1, `src/fonts/OFL.txt`); скачивание новых `.woff2` требует сети.

```bash
npm install                                # из корня репо — поднимет workspace
npm run build -w @uliss/design-system      # postcss autoprefixer -> dist/** (многофайловый CSS)
npm run typecheck -w @uliss/design-system  # tsc --noEmit по .tsx
./gradlew :uliss-design-system:jar         # транзитивно запустит npm + соберёт jar (META-INF/resources/ds/**)
```
