# Please (TM Edition) installer

This directory contains a standalone Please target and installer. It uses only
the built-in `genrule`, so no language plugin is required. The target installs
the TM edition in its own VS Code user-data and extension directories, so it
does not replace the released Please extension.

Run the target using its assigned build label:

```sh
plz run <target-label> -- install
plz run <target-label> -- build-install
plz run <target-label> -- status
plz run <target-label> -- uninstall
```

## Install the published release

The install command uses a sibling `please-vscode-tm.vsix` when one is present.
Otherwise it downloads `please-vscode-tm.vsix` from the latest GitHub release.
You can supply a different local artifact or URL:

```sh
plz run <target-label> -- install /path/to/please-vscode-tm.vsix
```

For a pinned rollout, set `PLEASE_TM_VSIX_URL` to a versioned release URL and
`PLEASE_TM_VSIX_SHA256` to its SHA-256 digest. The installer supports both
`shasum` and `sha256sum`.

## Build and install from source

Use `build-install` when the workstation should generate the VSIX instead of
downloading the published artifact:

```sh
plz run <target-label> -- build-install
```

This clones the `release` branch of `kopachef/please-vscode` into a temporary
directory, runs `npm ci --include=dev` and `npm run package`, installs the
generated VSIX, and removes the temporary checkout.

To generate the VSIX without installing it, provide an output path and an
optional branch or tag:

```sh
plz run <target-label> -- build ./please-vscode-tm.vsix v1.2.0-tm.1
plz run <target-label> -- install ./please-vscode-tm.vsix
```

Set `PLEASE_TM_SOURCE_REF` to change the default `release` ref or
`PLEASE_TM_SOURCE_REPOSITORY` to build from another Git repository. Source
builds require `git`, Node.js 20 or newer, and `npm` on `PATH`.

## Requirements and isolation

The machine must have the VS Code `code` command available on `PATH`. Installing
the published release also requires `curl`. Uninstall is offline and removes
only the directory created by this installer.

See [Using Please (TM Edition)](USAGE.md) for CodeLens, coverage, and workspace
settings examples.
