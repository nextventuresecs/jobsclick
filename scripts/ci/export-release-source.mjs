import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const { GITHUB_SHA: sha, GITHUB_OUTPUT: output, RUNNER_TEMP: temporary } = process.env;
if (!output || !temporary || !/^[a-f\d]{40}$/i.test(sha ?? '')) {
  throw new Error('Release export requires the workflow commit and output paths');
}

const root = mkdtempSync(join(temporary, 'release-source-'));
const source = join(root, 'source');
const archive = join(root, 'source.tar');
mkdirSync(source);
execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, sha], { timeout: 60_000 });
execFileSync('tar', ['-xf', archive, '-C', source], { timeout: 60_000 });
unlinkSync(archive);
appendFileSync(output, `path=${source}\n`);
