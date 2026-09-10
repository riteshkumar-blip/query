#!/usr/bin/env bash
set -euo pipefail

corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm run build:all
