#!/usr/bin/env bash
# Download the large, non-git assets into lab/ (native typesafe build + fine-tuned re-reader).
set -euo pipefail
cd "$(dirname "$0")/../lab"
BASE=https://github.com/mondweep/typesafe-lab/releases/download/v1.0
for f in typesafe-vendor-linux-x64.tar.gz reranker-deberta-v3-xsmall-bench-v1-int8.tar.gz; do
  echo "fetching $f"; curl -fL "$BASE/$f" | tar xz
done
echo "done: lab/vendor/typesafe and lab/models/rr-xsmall"
