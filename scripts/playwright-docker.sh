#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# the image must match @playwright/test in module/web/package.json; read it from there
playwright_version=$(node -p "require('$repository_root/module/web/package.json').devDependencies['@playwright/test']")
playwright_image="mcr.microsoft.com/playwright:v${playwright_version}-noble"

case "${1:-}" in
    test)
        playwright_script="visual:test:container"
        ;;
    update)
        playwright_script="visual:update:container"
        ;;
    *)
        echo "Usage: $0 {test|update}" >&2
        exit 2
        ;;
esac
shift

docker run --rm --init --ipc=host --platform linux/amd64 \
    --env CI=true \
    --volume "$repository_root:/work" \
    --volume /work/node_modules \
    --workdir /work \
    "$playwright_image" \
    /bin/sh -c 'npm ci && container_script=$1 && shift && npm run "$container_script" -w @uliss/web -- "$@"' \
    playwright-docker "$playwright_script" "$@"
