import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

export function createCli(): Command {
  const program = new Command();

  program
    .name('takefive')
    .description('Smart notification tool for Coding Agents (Codex, Claude Code, OpenCode, Antigravity)')
    .version('1.0.0');

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createCli();
  await program.parseAsync(argv);
}

const isDirectExecution = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
