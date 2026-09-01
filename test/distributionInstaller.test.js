const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'please-vscode-tm-installer-test-')
);
const binDirectory = path.join(temporaryRoot, 'bin');
const buildTemporaryDirectory = path.join(temporaryRoot, 'tmp');
const managedHome = path.join(temporaryRoot, 'managed', 'please-vscode-tm');
const invocationLog = path.join(temporaryRoot, 'invocations.log');
const codeState = path.join(temporaryRoot, 'code-extension-state');
const remoteCodeDirectory = path.join(
  temporaryRoot,
  '.vscode-server',
  'bin',
  'test',
  'bin',
  'remote-cli'
);
const remoteCode = path.join(remoteCodeDirectory, 'code');
const installer = path.resolve(
  __dirname,
  '../distribution/install/please-vscode-tm.sh'
);

fs.mkdirSync(binDirectory, { recursive: true });
fs.mkdirSync(buildTemporaryDirectory, { recursive: true });

function writeExecutable(name, lines) {
  const filename = path.join(binDirectory, name);
  fs.writeFileSync(filename, lines.join('\n') + '\n', { mode: 0o755 });
}

writeExecutable('git', [
  '#!/bin/sh',
  'set -eu',
  'printf \'git %s\\n\' "$*" >> "$TM_TEST_LOG"',
  'tm_destination=',
  'for tm_argument in "$@"; do',
  '  tm_destination=$tm_argument',
  'done',
  'mkdir -p "$tm_destination"',
]);

writeExecutable('npm', [
  '#!/bin/sh',
  'set -eu',
  'printf \'npm %s\\n\' "$*" >> "$TM_TEST_LOG"',
  'case "$*" in',
  '  "ci --include=dev") ;;',
  '  "run package")',
  '    mkdir -p dist',
  "    printf 'generated-vsix\\n' > dist/please-vscode-tm.vsix",
  '    ;;',
  '  *) exit 2 ;;',
  'esac',
]);

writeExecutable('code', [
  '#!/bin/sh',
  'set -eu',
  'printf \'code %s\\n\' "$*" >> "$TM_TEST_LOG"',
  'case " $* " in',
  '  *" --install-extension "*)',
  '    : > "$TM_TEST_CODE_STATE"',
  '    ;;',
  '  *" --uninstall-extension "*)',
  '    rm -f "$TM_TEST_CODE_STATE"',
  '    ;;',
  '  *" --list-extensions "*)',
  '    if [ -f "$TM_TEST_CODE_STATE" ]; then',
  "      printf 'kopachef.plz-vscode-tm@1.2.0\\n'",
  '    fi',
  '    if [ "$TM_TEST_RELEASED_INSTALLED" = "1" ]; then',
  "      printf 'please-build.plz-vscode@1.2.0\\n'",
  '    fi',
  '    ;;',
  'esac',
]);

fs.mkdirSync(remoteCodeDirectory, { recursive: true });
fs.copyFileSync(path.join(binDirectory, 'code'), remoteCode);
fs.chmodSync(remoteCode, 0o755);

const environment = {
  ...process.env,
  PATH: binDirectory + path.delimiter + process.env.PATH,
  PLEASE_TM_CODE_BIN: 'code',
  PLEASE_TM_HOME: managedHome,
  PLEASE_TM_SOURCE_REF: 'release',
  PLEASE_TM_SOURCE_REPOSITORY: 'https://example.invalid/please-vscode.git',
  TM_TEST_CODE_STATE: codeState,
  TM_TEST_LOG: invocationLog,
  TM_TEST_RELEASED_INSTALLED: '1',
  TMPDIR: buildTemporaryDirectory,
};

const remoteEnvironment = {
  ...environment,
  PLEASE_TM_CODE_BIN: remoteCode,
  XDG_CACHE_HOME: path.join(temporaryRoot, 'cache'),
};

function runInstaller(args, env = environment) {
  const result = spawnSync('sh', [installer, ...args], {
    encoding: 'utf8',
    env,
  });
  assert.equal(
    result.status,
    0,
    'Installer failed.\nstdout:\n' +
      result.stdout +
      '\nstderr:\n' +
      result.stderr
  );
  return result;
}

try {
  const output = path.join(temporaryRoot, 'artifacts', 'custom.vsix');
  const buildResult = runInstaller(['build', output, 'test-ref']);

  assert.equal(fs.readFileSync(output, 'utf8'), 'generated-vsix\n');
  assert.match(buildResult.stdout, /Built Please \(TM Edition\):/);

  const installResult = runInstaller(['build-install', 'install-ref']);
  assert.match(
    installResult.stdout,
    /Installed kopachef\.plz-vscode-tm@1\.2\.0/
  );

  const rejectedRemoteStatus = spawnSync('sh', [installer, 'remote-status'], {
    encoding: 'utf8',
    env: environment,
  });
  assert.equal(rejectedRemoteStatus.status, 1);
  assert.match(
    rejectedRemoteStatus.stderr,
    /Expected the remote-cli\/code provided by an active VS Code Server/
  );

  const remoteInstallResult = runInstaller(
    ['remote-install', output],
    remoteEnvironment
  );
  assert.match(
    remoteInstallResult.stdout,
    /Installed kopachef\.plz-vscode-tm@1\.2\.0 in the active Remote SSH extension host/
  );
  assert.match(
    remoteInstallResult.stderr,
    /please-build\.plz-vscode@1\.2\.0 is also installed/
  );

  const remoteStatusResult = runInstaller(['remote-status'], remoteEnvironment);
  assert.match(remoteStatusResult.stdout, /kopachef\.plz-vscode-tm@1\.2\.0/);
  assert.match(
    remoteStatusResult.stdout,
    /\.vscode-server\/.*remote-cli\/code/
  );

  const remoteBuildInstallResult = runInstaller(
    ['remote-build-install', 'remote-ref'],
    remoteEnvironment
  );
  assert.match(remoteBuildInstallResult.stdout, /Built Please \(TM Edition\):/);

  const remoteUninstallResult = runInstaller(
    ['remote-uninstall'],
    remoteEnvironment
  );
  assert.match(
    remoteUninstallResult.stdout,
    /Removed kopachef\.plz-vscode-tm@1\.2\.0 from the active Remote SSH extension host/
  );
  assert.match(
    remoteUninstallResult.stdout,
    /please-build\.plz-vscode extension was not changed/
  );

  const log = fs.readFileSync(invocationLog, 'utf8');
  assert.match(
    log,
    /git clone --depth 1 --branch test-ref https:\/\/example\.invalid\/please-vscode\.git/
  );
  assert.match(
    log,
    /git clone --depth 1 --branch install-ref https:\/\/example\.invalid\/please-vscode\.git/
  );
  assert.match(
    log,
    /git clone --depth 1 --branch remote-ref https:\/\/example\.invalid\/please-vscode\.git/
  );
  assert.match(log, /npm ci --include=dev/);
  assert.match(log, /npm run package/);
  assert.match(
    log,
    /code .*--install-extension .*please-vscode-tm-from-source\.vsix --force/
  );
  assert.match(
    log,
    new RegExp('code --install-extension ' + output + ' --force')
  );
  assert.match(
    log,
    /code --uninstall-extension kopachef\.plz-vscode-tm/
  );

  const remainingBuildDirectories = fs
    .readdirSync(buildTemporaryDirectory)
    .filter((name) => name.startsWith('please-vscode-tm-build.'));
  assert.deepEqual(remainingBuildDirectories, []);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('Distribution installer tests passed.');
