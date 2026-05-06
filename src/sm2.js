// SM-2 Spaced Repetition Algorithm
// Based on the SuperMemo SM-2 algorithm by Piotr Wozniak

const INTERVALS = [1, 6, 16, 45, 120, 300] // days

export function calcSM2(q, card) {
  // q: 0=forgot, 1=hard, 2=good, 3=easy
  let { ease, interval, repetitions } = card

  if (q < 2) {
    // Forgot or Hard — reset
    repetitions = 0
    interval = 1
    ease = Math.max(1.3, ease - 0.2)
  } else {
    repetitions += 1
    if (repetitions === 1) {
      interval = 1
    } else if (repetitions === 2) {
      interval = 6
    } else {
      interval = Math.round(interval * ease)
    }
    if (q === 3) {
      // Easy — bonus
      ease += 0.15
    } else if (q === 2) {
      // Good
      ease += 0.0
    } else {
      // Hard
      ease -= 0.15
    }
    ease = Math.max(1.3, ease)
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)

  return {
    ease: Math.round(ease * 100) / 100,
    interval,
    repetitions,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString(),
    lastQuality: q
  }
}

export function getDueCards(cards) {
  const now = new Date()
  return cards.filter(c => {
    if (!c.nextReview) return true // new card
    return new Date(c.nextReview) <= now
  })
}
