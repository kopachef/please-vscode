#!/bin/sh

set -eu

tm_extension_id="kopachef.plz-vscode-tm"
tm_script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
tm_repo_root=$(CDPATH= cd "$tm_script_dir/../.." && pwd)
tm_default_data_root=${XDG_DATA_HOME:-"$HOME/.local/share"}
tm_home=${PLEASE_TM_HOME:-"$tm_default_data_root/please-vscode-tm"}
tm_user_data="$tm_home/user-data"
tm_extensions="$tm_home/extensions"
tm_downloads="$tm_home/downloads"
tm_marker="$tm_home/.managed-by-please-vscode-tm"
tm_code_bin=${PLEASE_TM_CODE_BIN:-code}
tm_bundled_vsix="$tm_script_dir/please-vscode-tm.vsix"
tm_default_vsix="$tm_repo_root/dist/please-vscode-tm.vsix"
tm_release_vsix_url=${PLEASE_TM_VSIX_URL:-"https://github.com/kopachef/please-vscode/releases/latest/download/please-vscode-tm.vsix"}
tm_expected_sha256=${PLEASE_TM_VSIX_SHA256:-}

usage() {
  cat <<'EOF'
Usage: please-vscode-tm.sh <command> [argument]

Commands:
  install [vsix-or-url]  Install Please (TM Edition) in its isolated directory.
  open [workspace]       Open a workspace using the isolated TM edition.
  status                 Show the installed TM edition version.
  uninstall              Remove only the isolated TM edition installation.
EOF
}

require_code() {
  if ! command -v "$tm_code_bin" >/dev/null 2>&1; then
    echo "Cannot find '$tm_code_bin'. Install the VS Code 'code' shell command first." >&2
    exit 1
  fi
}

validate_managed_home() {
  case "$tm_home" in
    */please-vscode-tm) ;;
    *)
      echo "Refusing to manage '$tm_home': the path must end in please-vscode-tm." >&2
      exit 1
      ;;
  esac
}

installed_version() {
  if [ ! -d "$tm_extensions" ]; then
    return 0
  fi

  "$tm_code_bin" \
    --user-data-dir "$tm_user_data" \
    --extensions-dir "$tm_extensions" \
    --list-extensions \
    --show-versions 2>/dev/null | grep "^${tm_extension_id}@" || true
}

resolve_vsix() {
  tm_vsix_source=${1:-}

  if [ -z "$tm_vsix_source" ] && [ -f "$tm_bundled_vsix" ]; then
    tm_vsix_source=$tm_bundled_vsix
  elif [ -z "$tm_vsix_source" ] && [ -f "$tm_default_vsix" ]; then
    tm_vsix_source=$tm_default_vsix
  elif [ -z "$tm_vsix_source" ]; then
    tm_vsix_source=$tm_release_vsix_url
  fi

  case "$tm_vsix_source" in
    http://*|https://*)
      if ! command -v curl >/dev/null 2>&1; then
        echo "Cannot download the VSIX because curl is not installed." >&2
        exit 1
      fi
      mkdir -p "$tm_downloads"
      tm_downloaded_vsix="$tm_downloads/please-vscode-tm.vsix"
      echo "Downloading Please (TM Edition) from $tm_vsix_source" >&2
      curl --fail --location --silent --show-error \
        "$tm_vsix_source" --output "$tm_downloaded_vsix"
      printf '%s\n' "$tm_downloaded_vsix"
      ;;
    *)
      if [ ! -f "$tm_vsix_source" ]; then
        echo "Cannot find VSIX: $tm_vsix_source" >&2
        exit 1
      fi
      printf '%s\n' "$tm_vsix_source"
      ;;
  esac
}

verify_vsix() {
  tm_vsix_path=$1

  if [ -z "$tm_expected_sha256" ]; then
    return 0
  fi

  if command -v shasum >/dev/null 2>&1; then
    tm_actual_sha256=$(shasum -a 256 "$tm_vsix_path" | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    tm_actual_sha256=$(sha256sum "$tm_vsix_path" | awk '{print $1}')
  else
    echo "Cannot verify the VSIX because neither shasum nor sha256sum is installed." >&2
    exit 1
  fi

  if [ "$tm_actual_sha256" != "$tm_expected_sha256" ]; then
    echo "VSIX checksum mismatch." >&2
    echo "Expected: $tm_expected_sha256" >&2
    echo "Actual:   $tm_actual_sha256" >&2
    exit 1
  fi
}

install_tm() {
  require_code
  validate_managed_home

  mkdir -p "$tm_user_data" "$tm_extensions"
  printf '%s\n' "$tm_extension_id" > "$tm_marker"
  tm_vsix=$(resolve_vsix "${1:-}")
  verify_vsix "$tm_vsix"

  if ! "$tm_code_bin" \
    --user-data-dir "$tm_user_data" \
    --extensions-dir "$tm_extensions" \
    --install-extension "$tm_vsix" \
    --force; then
    echo "VS Code CLI installation failed; retrying once." >&2
    "$tm_code_bin" \
      --user-data-dir "$tm_user_data" \
      --extensions-dir "$tm_extensions" \
      --install-extension "$tm_vsix" \
      --force
  fi

  tm_installed=$(installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Installation completed without finding $tm_extension_id in the isolated directory." >&2
    exit 1
  fi

  echo "Installed $tm_installed"
  echo "Run '$0 open /path/to/workspace' to launch it."
}

open_tm() {
  require_code
  validate_managed_home

  tm_installed=$(installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Please (TM Edition) is not installed. Run '$0 install' first." >&2
    exit 1
  fi

  tm_workspace=${1:-"$PWD"}
  "$tm_code_bin" \
    --user-data-dir "$tm_user_data" \
    --extensions-dir "$tm_extensions" \
    --new-window "$tm_workspace"
}

status_tm() {
  require_code
  validate_managed_home

  tm_installed=$(installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Please (TM Edition) is not installed in $tm_home."
    exit 1
  fi

  echo "$tm_installed"
  echo "Managed directory: $tm_home"
}

uninstall_tm() {
  require_code
  validate_managed_home

  if [ ! -f "$tm_marker" ]; then
    echo "Refusing to remove '$tm_home': installer marker is missing." >&2
    exit 1
  fi

  "$tm_code_bin" \
    --user-data-dir "$tm_user_data" \
    --extensions-dir "$tm_extensions" \
    --uninstall-extension "$tm_extension_id" >/dev/null 2>&1 || true

  rm -rf "$tm_home"
  echo "Removed Please (TM Edition) from $tm_home."
  echo "The released please-build.plz-vscode extension was not changed."
}

tm_command=${1:-}
if [ "$#" -gt 0 ]; then
  shift
fi

case "$tm_command" in
  install) install_tm "${1:-}" ;;
  open) open_tm "${1:-}" ;;
  status) status_tm ;;
  uninstall) uninstall_tm ;;
  help|-h|--help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
