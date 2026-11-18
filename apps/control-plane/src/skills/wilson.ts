/** Wilson score interval lower bound for a binomial (likes vs dislikes). */
export function wilsonLowerBound(likes: number, dislikes: number, z = 1.96): number {
  const n = likes + dislikes
  if (n <= 0) return 0
  const phat = likes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = phat + z2 / (2 * n)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)
  return (centre - margin) / denom
}

/** Display 0–5 stars from a unit-interval Wilson score, one decimal. */
export function starsFromWilson(score: number): number {
  return Math.round(score * 50) / 10
}
