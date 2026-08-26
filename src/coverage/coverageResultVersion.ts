import { promises as fs } from 'fs';

/**
 * Returns a version for a coverage result that changes when the file is
 * replaced or rewritten. Missing results are represented by `undefined`.
 */
export async function coverageResultVersion(
  filename: string
): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filename);
    return [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
}
