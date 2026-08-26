const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  coverageResultVersion,
} = require('../out/src/coverage/coverageResultVersion');

async function main() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'please-coverage-version-')
  );
  const filename = path.join(directory, 'coverage.json');

  try {
    assert.strictEqual(await coverageResultVersion(filename), undefined);

    fs.writeFileSync(filename, '{"files":{}}');
    const initialVersion = await coverageResultVersion(filename);
    assert.ok(initialVersion);

    fs.appendFileSync(filename, '\n');
    assert.notStrictEqual(
      await coverageResultVersion(filename),
      initialVersion
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  console.log('Coverage result version tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
