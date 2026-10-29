// Per-day reading totals (words actually flashed and time spent playing),
// used for the statistics screen: today, streak, total and average speed.

export interface DayStats {
  words: number
  seconds: number
}

export type Days = Record<string, DayStats>

/** Local calendar day, "yyyy-MM-dd". */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const addDays = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)

export function record(days: Days, words: number, seconds: number, on = new Date()): Days {
  if (words <= 0) return days
  const key = dayKey(on)
  const current = days[key] ?? { words: 0, seconds: 0 }
  return { ...days, [key]: { words: current.words + words, seconds: current.seconds + seconds } }
}

export const statsOn = (days: Days, date: Date): DayStats => days[dayKey(date)] ?? { words: 0, seconds: 0 }

export const totalWords = (days: Days) => Object.values(days).reduce((sum, d) => sum + d.words, 0)

export function averageWPM(days: Days): number {
  const seconds = Object.values(days).reduce((sum, d) => sum + d.seconds, 0)
  return seconds > 0 ? Math.round(totalWords(days) / (seconds / 60)) : 0
}

/**
 * Consecutive days with some reading, ending today — or yesterday, so the
 * streak isn't shown as broken before today's session.
 */
export function currentStreak(days: Days, now = new Date()): number {
  let day = addDays(now, 0)
  if (statsOn(days, day).words === 0) day = addDays(day, -1)
  let streak = 0
  while (statsOn(days, day).words > 0) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}

/** The last `count` days, oldest first, including empty ones. */
export function recentDays(days: Days, count = 7, now = new Date()): { date: Date; stats: DayStats }[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(now, i - count + 1)
    return { date, stats: statsOn(days, date) }
  })
}

/** A reading time rounded to the minute, for display; undefined under a minute. */
export function readingTime(seconds: number): { hours: number; minutes: number } | undefined {
  if (seconds < 60) return undefined
  const minutes = Math.round(seconds / 60)
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}
