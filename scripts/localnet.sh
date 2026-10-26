#!/usr/bin/env bash
# Starts a fresh local validator with the Kestrel program preloaded at its declared ID.
set -euo pipefail
cd "$(dirname "$0")/.."
PROGRAM_ID=$(solana-keygen pubkey target/deploy/kestrel-keypair.json)
exec solana-test-validator --reset --quiet \
  --ledger .localnet-ledger \
  --bpf-program "$PROGRAM_ID" target/deploy/kestrel.so
