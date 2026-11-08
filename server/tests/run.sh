#!/usr/bin/env bash
# Resets demo data, then runs the e2e suite against the running API.
set -e
cd "$(dirname "$0")/.."
npx tsx src/seedDemo.ts
npx tsx tests/e2e.ts
