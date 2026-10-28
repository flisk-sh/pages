#!/usr/bin/env bash
# Copies the fixture folder into the case's working directory.
set -euo pipefail
cp -R "$(dirname "$0")/../fixtures/gpu-demo" ./gpu-demo
