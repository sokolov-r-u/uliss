#!/usr/bin/env bash
# Issues the uliss.home / auth.uliss.home TLS certificate for the compose web nginx from the local mkcert CA.
# One-time setup: brew install mkcert && mkcert -install. Re-run to renew; devices keep trusting the same CA.
set -euo pipefail

out_dir="$(cd "$(dirname "$0")/.." && pwd)/volumes/tls"
mkdir -p "$out_dir"

mkcert -cert-file "$out_dir/uliss.home.pem" -key-file "$out_dir/uliss.home-key.pem" \
    uliss.home auth.uliss.home localhost 127.0.0.1

echo "Certificate: $out_dir/uliss.home.pem"
echo "CA root to install on devices: $(mkcert -CAROOT)/rootCA.pem"
