const assert = require('assert').strict;
const Module = require('module');

let runInTerminal = true;
let failDiscovery = false;
let showCount = 0;
let selectedBuildDefs;
const executedCommands = [];
const outputLines = [];

const vscode = {
  commands: {
    executeCommand: async (...args) => executedCommands.push(args),
  },
  window: {
    showQuickPick: async (targets) => targets[0],
  },
  workspace: {
    getConfiguration: (section) => ({
      get: (key, fallback) => {
        if (section === 'please' && key === 'runInTerminal') {
          return runInTerminal;
        }
        if (section === 'please.coverage' && key === 'allowedBuildDefs') {
          return ['go_test', '', ' variant_go_test '];
        }
        return fallback;
      },
    }),
  },
};

const please = {
  outputChannel: {
    appendLine: (line) => outputLines.push(line),
    show: () => showCount++,
  },
};

const coverageTargets = {
  retrieveCoverageTargets: async (_filename, allowedBuildDefs) => {
    selectedBuildDefs = allowedBuildDefs;
    if (failDiscovery) {
      throw new Error('discovery failed');
    }
    return ['//calculator/domain:calculator_test'];
  },
  retrieveInputFileCoverageTargets: async () => [],
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return vscode;
  }
  if (request === '../please') {
    return please;
  }
  if (request === '../coverage/coverageTargets') {
    return coverageTargets;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  plzCoverDocumentCommand,
} = require('../out/src/commands/plzCoverDocumentCommand');

const document = {
  fileName: '/workspace/calculator/domain/calculator.go',
  uri: { fsPath: '/workspace/calculator/domain/calculator.go' },
};

async function testCoveragePresentation() {
  await plzCoverDocumentCommand({ document, sourceFile: true });
  assert.equal(showCount, 0);
  assert.deepStrictEqual(selectedBuildDefs, ['go_test', 'variant_go_test']);
  assert.deepStrictEqual(executedCommands, [
    [
      'plz',
      {
        command: 'cover',
        args: ['//calculator/domain:calculator_test'],
      },
    ],
  ]);

  runInTerminal = false;
  await plzCoverDocumentCommand({ document, sourceFile: true });
  assert.equal(showCount, 1);

  runInTerminal = true;
  failDiscovery = true;
  await plzCoverDocumentCommand({ document, sourceFile: true });
  assert.equal(showCount, 2);
  assert.match(outputLines[outputLines.length - 1], /discovery failed/);
}

testCoveragePresentation()
  .then(() => console.log('Coverage command presentation tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
