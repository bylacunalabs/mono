// Reading statistics: today, streak, totals, average speed and the last week.

import { averageWPM, currentStreak, recentDays, statsOn, totalWords } from '../core/stats'
import { library } from '../state/library'
import { useObserve } from '../state/store'
import { formatNumber } from './components'
import { Icon } from './icons'

export function StatsView() {
  useObserve(library)
  const days = library.days
  const week = recentDays(days)
  const max = Math.max(1, ...week.map(d => d.stats.words))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]

  return (
    <div class="screen">
      <div class="content">
        <h1 class="large-title">Statistics</h1>
        <div class="tiles">
          <Tile title="Today" icon="sun" value={formatNumber(statsOn(days, new Date()).words)} unit="words" />
          <Tile title="Streak" icon="flame" value={formatNumber(currentStreak(days))} unit="days" />
          <Tile title="Total" icon="book" value={formatNumber(totalWords(days))} unit="words" />
          <Tile title="Average speed" icon="speed" value={formatNumber(averageWPM(days))} unit="WPM" />
        </div>

        <section class="card glass chart-card">
          <h3>Last 7 days</h3>
          <div class="chart" role="img" aria-label="Words read in the last 7 days">
            <div class="chart-grid">
              {ticks.map(tick => (
                <div class="chart-line" style={{ bottom: `${(tick / top) * 100}%` }}>
                  <span>{formatNumber(tick)}</span>
                </div>
              ))}
            </div>
            <div class="chart-bars">
              {week.map(({ date, stats }) => (
                <div class="chart-column" title={`${formatNumber(stats.words)} words`}>
                  <div class="chart-bar-area">
                    <div class="chart-bar" style={{ height: `${(stats.words / top) * 100}%` }} />
                  </div>
                  <span class="chart-label">{date.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {totalWords(days) === 0 && <p class="footnote center">Your reading sessions will show up here.</p>}
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
