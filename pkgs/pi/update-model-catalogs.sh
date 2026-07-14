#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
catalog_dir="$script_dir/model-catalogs"

mkdir -p "$catalog_dir"

fetch() {
  local url="$1"
  local output="$2"
  local tmp

  tmp="$(mktemp "${output}.tmp.XXXXXX")"

  cleanup() {
    rm -f "$tmp"
  }
  trap cleanup RETURN

  echo "Fetching $url"
  curl --fail --location --show-error --silent "$url" --output "$tmp"

  if command -v jq >/dev/null 2>&1; then
    jq empty "$tmp" >/dev/null
  fi

  mv "$tmp" "$output"
  trap - RETURN
}

fetch "https://models.dev/api.json" "$catalog_dir/models-dev-api.json"
fetch "https://integrate.api.nvidia.com/v1/models" "$catalog_dir/nvidia-models.json"
fetch "https://openrouter.ai/api/v1/models" "$catalog_dir/openrouter-models.json"
fetch "https://ai-gateway.vercel.sh/v1/models" "$catalog_dir/ai-gateway-models.json"

echo "Updated pi model catalog snapshots in $catalog_dir"
