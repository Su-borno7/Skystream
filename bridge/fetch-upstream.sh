#!/usr/bin/env bash
# Fetches the pinned upstream sources that cs-library is compiled from.
# CloudStream's own `library` module is the exact API extensions are compiled
# against, so building it from source keeps binary compatibility with real .cs3
# plugins. NiceHttp (the library's HTTP layer) is compiled the same way.
set -euo pipefail
cd "$(dirname "$0")"
CS_COMMIT="${CS_COMMIT:-a28e6468f54cfe420feebd205d3d21d08ed0cde8}"
NICEHTTP_TAG="${NICEHTTP_TAG:-0.4.18}"

fetch() { # url dir ref
  if [ ! -d "upstream/$2/.git" ]; then
    git init -q "upstream/$2"
    git -C "upstream/$2" remote add origin "$1"
  fi
  git -C "upstream/$2" fetch -q --depth 1 origin "$3"
  git -C "upstream/$2" checkout -q FETCH_HEAD
  echo "upstream/$2 @ $(git -C "upstream/$2" rev-parse --short HEAD)"
}
fetch https://github.com/recloudstream/cloudstream.git cloudstream "$CS_COMMIT"
fetch https://github.com/Blatzar/NiceHttp.git nicehttp "refs/tags/$NICEHTTP_TAG"
