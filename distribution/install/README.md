# Please (TM Edition) installer

This directory contains a standalone Please target and installer. It uses only
the built-in `genrule`, so no language plugin is required. The target installs
the TM edition in its own VS Code user-data and extension directories, so it
does not replace the released Please extension.

Run the target using its assigned build label:

```sh
plz run <target-label> -- install
plz run <target-label> -- status
plz run <target-label> -- uninstall
```

The install command uses a sibling `please-vscode-tm.vsix` when one is present.
Otherwise it downloads `please-vscode-tm.vsix` from the latest GitHub release.
You can supply a different local artifact or URL:

```sh
plz run <target-label> -- install /path/to/please-vscode-tm.vsix
```

The zero-argument install requires that the GitHub release asset has been
published. Until then, pass the locally packaged VSIX path as shown above.

For a pinned rollout, set `PLEASE_TM_VSIX_URL` to a versioned release URL and
`PLEASE_TM_VSIX_SHA256` to its SHA-256 digest. The installer supports both
`shasum` and `sha256sum`.

The machine must have the VS Code `code` command available on `PATH`. Installing
from GitHub also requires `curl`. Uninstall is offline and removes only a
directory created by this installer.

See [Using Please (TM Edition)](USAGE.md) for CodeLens, coverage, and workspace
settings examples.
