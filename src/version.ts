import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Single source of truth for version metadata extracted dynamically from package.json.
 */
function resolvePackageVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(currentDir, 'package.json'),
      join(currentDir, '..', 'package.json'),
      join(currentDir, '..', '..', 'package.json'),
    ];
    for (const candidate of candidates) {
      try {
        const raw = readFileSync(candidate, 'utf-8');
        const pkg = JSON.parse(raw);
        if (pkg && typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
          return pkg.version.trim();
        }
      } catch {}
    }
  } catch {}
  return '0.6.0';
}

export const VERSION = resolvePackageVersion();
