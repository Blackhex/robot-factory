/**
 * Probability that a unit produced at the given belt/processing speed will be defective.
 *
 * Linearly interpolates over the speed range [1, 10]:
 *   - speed <= 1  → 0.02
 *   - speed >= 10 → 0.35
 *   - in between  → 0.02 + (speed - 1) * (0.35 - 0.02) / 9
 *
 * Pure function — no randomness, no side effects.
 */
export function defectProbability(speed: number): number {
  if (speed <= 1) {
    return 0.02
  }
  if (speed >= 10) {
    return 0.35
  }
  return 0.02 + ((speed - 1) * (0.35 - 0.02)) / 9
}
