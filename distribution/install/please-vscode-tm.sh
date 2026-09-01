#!/bin/sh

set -eu

tm_extension_id="kopachef.plz-vscode-tm"
tm_released_extension_id="please-build.plz-vscode"
tm_script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
tm_repo_root=$(CDPATH= cd "$tm_script_dir/../.." && pwd)
tm_default_data_root=${XDG_DATA_HOME:-"$HOME/.local/share"}
tm_home=${PLEASE_TM_HOME:-"$tm_default_data_root/please-vscode-tm"}
tm_user_data="$tm_home/user-data"
tm_extensions="$tm_home/extensions"
tm_downloads="$tm_home/downloads"
tm_default_cache_root=${XDG_CACHE_HOME:-"$HOME/.cache"}
tm_remote_cache="$tm_default_cache_root/please-vscode-tm"
tm_marker="$tm_home/.managed-by-please-vscode-tm"
tm_code_bin=${PLEASE_TM_CODE_BIN:-code}
tm_bundled_vsix="$tm_script_dir/please-vscode-tm.vsix"
tm_default_vsix="$tm_repo_root/dist/please-vscode-tm.vsix"
tm_release_vsix_url=${PLEASE_TM_VSIX_URL:-"https://github.com/kopachef/please-vscode/releases/latest/download/please-vscode-tm.vsix"}
tm_expected_sha256=${PLEASE_TM_VSIX_SHA256:-}
tm_source_repository=${PLEASE_TM_SOURCE_REPOSITORY:-"https://github.com/kopachef/please-vscode.git"}
tm_source_ref=${PLEASE_TM_SOURCE_REF:-release}
tm_tmp_root=${TMPDIR:-/tmp}
tm_tmp_root=${tm_tmp_root%/}
tm_build_dir=
tm_built_vsix=

usage() {
  cat <<'EOF'
Usage: please-vscode-tm.sh <command> [argument]

Commands:
  install [vsix-or-url]       Install the published or supplied VSIX.
  build [output-vsix] [ref]   Build a VSIX from source without installing it.
  build-install [ref]         Build a VSIX from source and install it.
  remote-install [source]     Install into the active Remote SSH extension host.
  remote-build-install [ref]  Build and install into the Remote SSH host.
  remote-status               Show the version installed in the Remote SSH host.
  remote-uninstall            Uninstall only TM Edition from the Remote SSH host.
  open [workspace]            Open a workspace using the isolated TM edition.
  status                      Show the installed TM edition version.
  uninstall                   Remove only the isolated TM edition installation.
EOF
}

require_command() {
  tm_required_command=$1
  if ! command -v "$tm_required_command" >/dev/null 2>&1; then
    echo "Cannot find '$tm_required_command' required to build the VSIX from source." >&2
    exit 1
  fi
}

require_code() {
  if ! command -v "$tm_code_bin" >/dev/null 2>&1; then
    echo "Cannot find '$tm_code_bin'. Install the VS Code 'code' shell command first." >&2
    exit 1
  fi
}

require_remote_code() {
  if ! command -v "$tm_code_bin" >/dev/null 2>&1; then
    echo "Cannot find the VS Code Server 'code' CLI." >&2
    echo "Run this command in the integrated terminal of a connected Remote SSH window." >&2
    exit 1
  fi

  tm_remote_code_path=$(command -v "$tm_code_bin")
  case "$tm_remote_code_path" in
    */.vscode-server/*/remote-cli/code|*/.vscode-server-insiders/*/remote-cli/code|*/.vscode-remote/*/remote-cli/code) ;;
    *)
      echo "Refusing to use '$tm_remote_code_path' for a Remote SSH installation." >&2
      echo "Expected the remote-cli/code provided by an active VS Code Server." >&2
      echo "Open an integrated terminal in the connected Remote SSH window and try again." >&2
      exit 1
      ;;
  esac
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

cleanup_source_build() {
  if [ -z "$tm_build_dir" ]; then
    return 0
  fi

  case "$tm_build_dir" in
    "$tm_tmp_root"/please-vscode-tm-build.*)
      rm -rf "$tm_build_dir"
      tm_build_dir=
      ;;
    *)
      echo "Refusing to remove unexpected source-build directory: $tm_build_dir" >&2
      ;;
  esac
}

trap cleanup_source_build 0

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
  tm_vsix_downloads=${2:-$tm_downloads}

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
      mkdir -p "$tm_vsix_downloads"
      tm_downloaded_vsix="$tm_vsix_downloads/please-vscode-tm.vsix"
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

build_source_vsix() {
  tm_output_path=${1:-"$PWD/please-vscode-tm.vsix"}
  tm_requested_ref=${2:-$tm_source_ref}

  require_command git
  require_command npm

  case "$tm_output_path" in
    /*) ;;
    *) tm_output_path="$PWD/$tm_output_path" ;;
  esac

  tm_build_dir=$(mktemp -d "$tm_tmp_root/please-vscode-tm-build.XXXXXX")
  tm_checkout="$tm_build_dir/repository"

  echo "Cloning $tm_source_repository at $tm_requested_ref" >&2
  git clone --depth 1 --branch "$tm_requested_ref" \
    "$tm_source_repository" "$tm_checkout"

  (
    cd "$tm_checkout"
    npm ci --include=dev
    npm run package
  )

  tm_packaged_vsix="$tm_checkout/dist/please-vscode-tm.vsix"
  if [ ! -f "$tm_packaged_vsix" ]; then
    echo "Source build completed without producing $tm_packaged_vsix." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$tm_output_path")"
  cp "$tm_packaged_vsix" "$tm_output_path"
  tm_built_vsix=$tm_output_path
  echo "Built Please (TM Edition): $tm_built_vsix"

  cleanup_source_build
}

build_install_tm() {
  require_code
  validate_managed_home

  mkdir -p "$tm_downloads"
  build_source_vsix \
    "$tm_downloads/please-vscode-tm-from-source.vsix" \
    "${1:-$tm_source_ref}"
  install_tm "$tm_built_vsix"
}

remote_installed_version() {
  "$tm_code_bin" \
    --list-extensions \
    --show-versions 2>/dev/null | grep "^${tm_extension_id}@" || true
}

released_remote_version() {
  "$tm_code_bin" \
    --list-extensions \
    --show-versions 2>/dev/null | grep "^${tm_released_extension_id}@" || true
}

warn_if_released_remote_installed() {
  tm_released_remote=$(released_remote_version)
  if [ -z "$tm_released_remote" ]; then
    return 0
  fi

  echo "Warning: $tm_released_remote is also installed in this Remote SSH host." >&2
  echo "Disable it for the remote workspace to avoid overlapping CodeLens providers." >&2
}

remote_install_tm() {
  require_remote_code

  tm_vsix=$(resolve_vsix "${1:-}" "$tm_remote_cache")
  verify_vsix "$tm_vsix"

  "$tm_code_bin" --install-extension "$tm_vsix" --force

  tm_installed=$(remote_installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Remote installation completed without finding $tm_extension_id." >&2
    exit 1
  fi

  echo "Installed $tm_installed in the active Remote SSH extension host."
  warn_if_released_remote_installed
  echo "Run 'Developer: Reload Window' in VS Code to activate it."
}

remote_build_install_tm() {
  require_remote_code

  mkdir -p "$tm_remote_cache"
  build_source_vsix \
    "$tm_remote_cache/please-vscode-tm-from-source.vsix" \
    "${1:-$tm_source_ref}"
  remote_install_tm "$tm_built_vsix"
}

remote_status_tm() {
  require_remote_code

  tm_installed=$(remote_installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Please (TM Edition) is not installed in the active Remote SSH host."
    exit 1
  fi

  echo "$tm_installed"
  echo "Remote CLI: $tm_remote_code_path"
  warn_if_released_remote_installed
}

remote_uninstall_tm() {
  require_remote_code

  tm_installed=$(remote_installed_version)
  if [ -z "$tm_installed" ]; then
    echo "Please (TM Edition) is not installed in the active Remote SSH host." >&2
    exit 1
  fi

  "$tm_code_bin" --uninstall-extension "$tm_extension_id"

  if [ -n "$(remote_installed_version)" ]; then
    echo "Remote uninstall completed but $tm_extension_id is still listed." >&2
    exit 1
  fi

  echo "Removed $tm_installed from the active Remote SSH extension host."
  echo "The released $tm_released_extension_id extension was not changed."
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
  build) build_source_vsix "${1:-}" "${2:-$tm_source_ref}" ;;
  build-install) build_install_tm "${1:-$tm_source_ref}" ;;
  remote-install) remote_install_tm "${1:-}" ;;
  remote-build-install) remote_build_install_tm "${1:-$tm_source_ref}" ;;
  remote-status) remote_status_tm ;;
  remote-uninstall) remote_uninstall_tm ;;
  open) open_tm "${1:-}" ;;
  status) status_tm ;;
  uninstall) uninstall_tm ;;
  help|-h|--help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
