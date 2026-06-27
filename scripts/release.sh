#!/usr/bin/env bash
#
# SiberLLM — build & publish a release to GitHub.
#
# Usage:
#   ./scripts/release.sh                    # build .dmg locally (no publish)
#   ./scripts/release.sh 0.2.0              # bump to 0.2.0, tag, publish draft release
#   GITHUB_TOKEN=xxx ./scripts/release.sh 0.2.0
#
# Requirements:
#   - git (with the repo pushed to github.com/datasiberLab/siberllm)
#   - a GitHub token (classic PAT) with `repo` scope, exported as GITHUB_TOKEN
#     or GH_TOKEN. `gh auth login` also works.
#
set -euo pipefail

# ---- colors ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}›${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$1"; }
die()   { printf "${RED}✗${NC} %s\n" "$1" >&2; exit 1; }

cd "$(dirname "$0")/.."

VERSION="${1:-}"
PUBLISH=0
[[ -n "${VERSION:-}" ]] && PUBLISH=1

# ---- preflight ----
info "Pre-flight checks"

command -v git >/dev/null || die "git tidak ditemukan."
command -v node >/dev/null || die "node tidak ditemukan."

if [[ "$PUBLISH" -eq 1 ]]; then
  # Token from env, else try gh CLI's stored auth.
  if [[ -z "${GITHUB_TOKEN:-}" && -z "${GH_TOKEN:-}" ]]; then
    if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
      export GH_TOKEN="$(gh auth token)"
      ok "Memakai token dari 'gh auth'."
    else
      die "GITHUB_TOKEN/GH_TOKEN kosong dan 'gh auth' belum login. Jalankan:\n  export GITHUB_TOKEN=ghp_xxx"
    fi
  fi

  git rev-parse --abbrev-ref HEAD | grep -qE '^(main|master)$' \
    || die "Harus ada di branch main/master untuk publish. (sekarang: $(git rev-parse --abbrev-ref HEAD))"

  [[ -z "$(git status --porcelain)" ]] \
    || die "Working tree kotor. Commit/stash dulu sebelum release."
fi

ok "Pre-flight OK"

# ---- install deps if needed ----
[[ -d node_modules ]] || { info "Installing dependencies…"; npm ci; }

# ---- version bump ----
if [[ "$PUBLISH" -eq 1 ]]; then
  CURRENT=$(node -p "require('./package.json').version")
  info "Bump versi: ${CURRENT} → ${VERSION}"
  npm version "$VERSION" --no-git-tag-version
  git add package.json
  git commit -m "chore(release): v${VERSION}" >/dev/null
  git tag -a "v${VERSION}" -m "SiberLLM v${VERSION}"
  ok "Tag v${VERSION} dibuat."
fi

# ---- build + make artifacts ----
if [[ "$PUBLISH" -eq 1 ]]; then
  info "Build + publish draft release ke GitHub…"
  npm run publish
  ok "Draft release v${VERSION} dibuat di GitHub. Cek & publikasikan manual."
  warn "Lihat: https://github.com/candrapwr/siberllm/releases"
else
  info "Build artifacts lokal (dmg/zip)…"
  npm run make
  ok "Build selesai. Output ada di: $(pwd)/out/make"
  ls -lh out/make/**/*.{dmg,zip} 2>/dev/null || find out/make -maxdepth 3 -type f \( -name '*.dmg' -o -name '*.zip' \) -exec ls -lh {} \;
fi

ok "Selesai!"
