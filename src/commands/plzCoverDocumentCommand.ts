import {
  plzDocumentTestCommand,
  PlzDocumentTestCommandArgs,
} from './plzDocumentTestCommand';
import { retrieveCoverageTarget } from '../coverage/coverageTargets';

export async function plzCoverDocumentCommand(
  args: PlzDocumentTestCommandArgs
): Promise<void> {
  return plzDocumentTestCommand(
    'cover',
    args,
    args.sourceFile ? retrieveCoverageTarget : undefined
  );
}
