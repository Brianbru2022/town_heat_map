import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspacePath = resolve('pnpm-workspace.yaml');
const workspace = await readFile(workspacePath, 'utf8');

if (/^dangerouslyAllowAllBuilds:\s*true\s*$/m.test(workspace)) {
  throw new Error('pnpm build policy must not enable dangerouslyAllowAllBuilds.');
}

if (/^strictDepBuilds:\s*false\s*$/m.test(workspace)) {
  throw new Error('pnpm build policy must keep strictDepBuilds enabled.');
}

const policyMatch = workspace.match(/^allowBuilds:\r?\n((?: {2}[^\r\n]+\r?\n?)*)/m);
if (!policyMatch) {
  throw new Error('pnpm build policy must declare allowBuilds in pnpm-workspace.yaml.');
}

const entries = policyMatch[1]
  .trimEnd()
  .split(/\r?\n/)
  .map((line) => {
    const match = line.match(/^ {2}([^:#][^:]*): (true|false)$/);
    if (!match) {
      throw new Error(`Invalid or unreviewed allowBuilds entry: ${line.trim()}`);
    }
    return { packageName: match[1], allowed: match[2] === 'true' };
  });

const approved = entries.filter((entry) => entry.allowed).map((entry) => entry.packageName);
if (approved.length !== 1 || approved[0] !== 'esbuild') {
  throw new Error(
    `Only reviewed esbuild build scripts may be approved; found: ${approved.join(', ') || 'none'}.`,
  );
}

console.log('pnpm build-script policy verified: esbuild is the only approved dependency.');
