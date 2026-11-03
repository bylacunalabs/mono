// Reading statistics: today, streak, totals, average speed and the last week.

import { useEffect } from 'preact/hooks'
import { EVENTS, trackEvent } from '../analytics'
import { averageWPM, currentStreak, recentDays, statsOn, totalWords } from '../core/stats'
import { locale, t } from '../state/i18n'
import { library } from '../state/library'
import { useObserve } from '../state/store'
import { formatNumber } from './components'
import { Icon } from './icons'

export function StatsView() {
  useEffect(() => {
    trackEvent(EVENTS.statsOpened)
  }, [])
  useObserve(library)
  const days = library.days
  const week = recentDays(days)
  const max = Math.max(1, ...week.map(d => d.stats.words))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const today = statsOn(days, new Date()).words
  const streak = currentStreak(days)
  const total = totalWords(days)
  const average = averageWPM(days)

  return (
    <div class="screen">
      <div class="content">
        <h1 class="large-title">{t.statistics}</h1>
        <div class="tiles">
          <Tile title={t.today} icon="sun" value={formatNumber(today)} unit={t.wordsUnit(today)} />
          <Tile title={t.streak} icon="flame" value={formatNumber(streak)} unit={t.daysUnit(streak)} />
          <Tile title={t.total} icon="book" value={formatNumber(total)} unit={t.wordsUnit(total)} />
          <Tile title={t.averageSpeed} icon="speed" value={formatNumber(average)} unit={t.wpm} />
        </div>

        <section class="card glass chart-card">
          <h3>{t.lastSevenDays}</h3>
          <div class="chart" role="img" aria-label={t.lastSevenDaysLabel}>
            <div class="chart-grid">
              {ticks.map(tick => (
                <div class="chart-line" style={{ bottom: `${(tick / top) * 100}%` }}>
                  <span>{formatNumber(tick)}</span>
                </div>
              ))}
            </div>
            <div class="chart-bars">
              {week.map(({ date, stats }) => (
                <div class="chart-column" title={t.words(stats.words)}>
                  <div class="chart-bar-area">
                    <div class="chart-bar" style={{ height: `${(stats.words / top) * 100}%` }} />
                  </div>
                  <span class="chart-label">{date.toLocaleDateString(locale, { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {total === 0 && <p class="footnote center">{t.statsEmpty}</p>}
      </div>
    </div>
  )
}

function Tile(props: { title: string; icon: 'sun' | 'flame' | 'book' | 'speed'; value: string; unit: string }) {
  return (
    <div class="tile glass">
      <span class="tile-title">
        <Icon name={props.icon} size={15} /> {props.title}
      </span>
      <span class="tile-value">{props.value}</span>
      <span class="tile-unit">{props.unit}</span>
    </div>
  )
}

/** Round axis values up to just above `max`. */
function niceTicks(max: number): number[] {
  const rough = max / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= rough) ?? magnitude * 10
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}
