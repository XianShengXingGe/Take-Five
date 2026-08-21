/**
 * Shared utilities for manipulating and chaining agent lifecycle hook commands.
 */

/**
 * Merges a Take Five hook command non-destructively with any pre-existing user command.
 */
export function mergeHookCommand(existing: unknown, takeFiveCmd: string): string {
  if (typeof existing === 'string') {
    const trimmed = existing.trim();
    if (!trimmed) {
      return takeFiveCmd;
    }
    if (trimmed.includes(takeFiveCmd)) {
      return trimmed;
    }
    return `${trimmed} && ${takeFiveCmd}`;
  }
  return takeFiveCmd;
}

/**
 * Surgically removes Take Five hook command from a chained command string.
 */
export function stripHookCommand(current: unknown, marker = 'takefive notify'): string | undefined {
  if (typeof current !== 'string') {
    return undefined;
  }
  const parts = current
    .split('&&')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.includes(marker));

  return parts.length > 0 ? parts.join(' && ') : undefined;
}
