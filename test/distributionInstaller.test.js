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
  '  *" --list-extensions "*)',
  "    printf 'kopachef.plz-vscode-tm@1.2.0\\n'",
  '    ;;',
  'esac',
]);

const environment = {
  ...process.env,
  PATH: binDirectory + path.delimiter + process.env.PATH,
  PLEASE_TM_CODE_BIN: 'code',
  PLEASE_TM_HOME: managedHome,
  PLEASE_TM_SOURCE_REF: 'release',
  PLEASE_TM_SOURCE_REPOSITORY: 'https://example.invalid/please-vscode.git',
  TM_TEST_LOG: invocationLog,
  TMPDIR: buildTemporaryDirectory,
};

function runInstaller(args) {
  const result = spawnSync('sh', [installer, ...args], {
    encoding: 'utf8',
    env: environment,
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

  const log = fs.readFileSync(invocationLog, 'utf8');
  assert.match(
    log,
    /git clone --depth 1 --branch test-ref https:\/\/example\.invalid\/please-vscode\.git/
  );
  assert.match(
    log,
    /git clone --depth 1 --branch install-ref https:\/\/example\.invalid\/please-vscode\.git/
  );
  assert.match(log, /npm ci --include=dev/);
  assert.match(log, /npm run package/);
  assert.match(
    log,
    /code .*--install-extension .*please-vscode-tm-from-source\.vsix --force/
  );

  const remainingBuildDirectories = fs
    .readdirSync(buildTemporaryDirectory)
    .filter((name) => name.startsWith('please-vscode-tm-build.'));
  assert.deepEqual(remainingBuildDirectories, []);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('Distribution installer tests passed.');
