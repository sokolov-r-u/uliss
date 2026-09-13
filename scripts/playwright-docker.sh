#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
playwright_image="mcr.microsoft.com/playwright:v1.62.1-noble"

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

docker run --rm --init --ipc=host --platform linux/amd64 \
    --env CI=true \
    --volume "$repository_root:/work" \
    --volume /work/node_modules \
    --workdir /work \
    "$playwright_image" \
    /bin/sh -c "npm ci && npm run $playwright_script -w @uliss/web"
