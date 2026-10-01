import type { BtccRow } from "@/lib/btcc/types";

// docs/RULES.md §5.3; desktop MainWindow::CheckSkillLvl,
// mainwindow.cpp:1851–1919.
const THRESHOLDS = [30, 50, 80, 120, 170, 230, 300, 380, 470, 570] as const;

/**
 * Convert finite-integer skill XP to a level from 0 through 10.
 * Inputs are read-only: neither the traits array nor its rows are mutated.
 * Any exact-name Fast Learner row with raw XP >= 300 reduces thresholds by 20%;
 * any exact-name Slow Learner row with raw XP <= -300 raises them by 20%.
 * Duplicate rows do not stack, and qualifying fast/slow modifiers cancel.
 * Skill and trait XP come from the existing finite-integer XP domain.
 */
export function skillLevel(xp: number, traits: readonly BtccRow[]): number {
  let fast = false;
  let slow = false;
  for (const trait of traits) {
    if (trait.name === "Fast Learner" && trait.xp >= 300) fast = true;
    if (trait.name === "Slow Learner" && trait.xp <= -300) slow = true;
  }

  const numerator = 5 - Number(fast) + Number(slow);
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= (THRESHOLDS[i] * numerator) / 5) return i + 1;
  }
  return 0;
}
