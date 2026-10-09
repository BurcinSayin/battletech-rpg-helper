/** Attribute levels from accumulated XP (issue #58); null means XP is missing. */
export function attributeLevel(xp: number | undefined): number | null {
  return xp === undefined ? null : Math.floor(xp / 100);
}

/**
 * Issue #58 Link Modifier table: 1 → -2, 2–3 → -1, 4–6 → 0,
 * 7–9 → +1, 10 → +2, 11+ → floor(level / 3).
 * Null means the level is missing or below the defined range (Level 1).
 */
export function attributeLinkModifier(level: number | null): number | null {
  if (level === null || level < 1) return null;
  if (level === 1) return -2;
  if (level < 4) return -1;
  if (level < 7) return 0;
  if (level < 10) return 1;
  if (level === 10) return 2;
  return Math.floor(level / 3);
}
