#!/usr/bin/env bash
# Builds a publish-like copy of @uliss/design-system for design-sync.
# The package ships TS source only, so the converter gets a synthetic dist:
# ESM bundle + tsc declarations + one concatenated stylesheet + fonts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DS="$ROOT/module/lib/uliss-design-system"
NM="$ROOT/.design-sync/.cache/nm"
PKG="$NM/@uliss/design-system"

rm -rf "$NM"
mkdir -p "$PKG/dist" "$PKG/css" "$NM/@types"
for p in react react-dom; do ln -s "$ROOT/node_modules/$p" "$NM/$p"; done
for p in react react-dom; do ln -s "$ROOT/node_modules/@types/$p" "$NM/@types/$p"; done
[ -d "$ROOT/node_modules/scheduler" ] && ln -s "$ROOT/node_modules/scheduler" "$NM/scheduler"
[ -d "$ROOT/node_modules/csstype" ] && ln -s "$ROOT/node_modules/csstype" "$NM/csstype"

# Source copy: JSDoc/group enrichment and adjacent .prompt.md docs.
rsync -a --exclude .claude "$DS/src/" "$PKG/src/"
rsync -a --exclude .claude "$DS/src/fonts/" "$PKG/fonts/"
# Adjacent <Name>.prompt.md contracts become the per-component docs (cfg.docsDir).
mkdir -p "$PKG/component-docs"
find "$DS/src/react/components" -name '*.prompt.md' | while read -r f; do
  cp "$f" "$PKG/component-docs/$(basename "$f" .prompt.md).md"
done

"$ROOT/node_modules/.bin/esbuild" "$DS/src/react/index.ts" --bundle --format=esm \
  --jsx=automatic --external:react --external:react-dom --outfile="$PKG/dist/index.js" --log-level=warning

"$ROOT/node_modules/.bin/tsc" -p "$DS/tsconfig.json" --noEmit false --declaration --emitDeclarationOnly \
  --outDir "$PKG/dist/types"

# Autoprefixed token CSS in src/styles.css import order; ../fonts/ urls resolve from css/.
(cd "$DS" && npm run build --silent)
: > "$PKG/css/uliss.css"
for f in $(sed -n "s/^@import '\.\/\(.*\)';/\1/p" "$DS/src/styles.css"); do
  cat "$DS/dist/$f" >> "$PKG/css/uliss.css"
  printf '\n' >> "$PKG/css/uliss.css"
done

VERSION="$(node -p "require('$DS/package.json').version")"
cat > "$PKG/package.json" <<EOF
{
  "name": "@uliss/design-system",
  "version": "$VERSION",
  "type": "module",
  "module": "dist/index.js",
  "types": "dist/types/index.d.ts",
  "peerDependencies": { "react": ">=18" }
}
EOF
echo "built $PKG"
