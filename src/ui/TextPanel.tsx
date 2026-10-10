// The whole text as flowing paragraphs under the RSVP word: shown while
// paused, and all the time in "keep text visible" mode. It follows the
// current word as reading advances, lets the reader scroll freely (following
// resumes a few seconds after scrolling stops), marks chapter starts, and
// jumps to any word that's tapped.
//
// Only the paragraph holding the current word is split into word elements;
// every other paragraph is a single text node (a tap is mapped to its word
// through the caret position), so even a whole book stays light.

import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import type { Chapter } from '../core/book'
import { lastPosition } from '../core/engine'
import type { Token } from '../core/tokenizer'
import { cssFont, type ReadingFont } from './fonts'

interface Props {
  tokens: Token[]
  paragraphs: [number, number][]
  chapters: Chapter[]
  currentIndex: number
  isPlaying: boolean
  font: ReadingFont
  onSelect: (index: number) => void
  style?: Record<string, string | number>
  /** A column beside the word (phone on its side) rather than below it. */
  side?: boolean
}

const TEXT_SIZE = 18

export function TextPanel(props: Props) {
  const { tokens, paragraphs, chapters, currentIndex, isPlaying } = props
  const scroller = useRef<HTMLDivElement>(null)
  const followPausedUntil = useRef(0)
  const lastFollowedIndex = useRef(-1)
  const lastFollowedParagraph = useRef(-1)
  const previousIndex = useRef(-1)

  const starts = useMemo(() => paragraphs.map(p => p[0]), [paragraphs])
  const titles = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of chapters) if (!map.has(c.wordIndex)) map.set(c.wordIndex, c.title)
    return map
  }, [chapters])
  const currentParagraph = lastPosition(starts, currentIndex) ?? 0

  /** Puts the current word 30% down the panel. */
  const scrollToWord = (index: number, smooth: boolean) => {
    const container = scroller.current
    const word = container?.querySelector<HTMLElement>(`[data-i="${index}"]`)
    if (!container || !word) return
    // Measured on screen: paragraphs are laid out with containment
    // (content-visibility), so offsetTop is relative to the paragraph.
    const offset = word.getBoundingClientRect().top - container.getBoundingClientRect().top
    const top = Math.max(0, container.scrollTop + offset - container.clientHeight * 0.3)
    container.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' })
  }

  const follow = (from: number, to: number) => {
    if (Date.now() < followPausedUntil.current || !paragraphs.length) return
    const isJump =
      Math.abs(to - from) > 1 ||
      lastFollowedIndex.current < 0 ||
      Math.abs(currentParagraph - lastFollowedParagraph.current) > 1
    if (isJump || !isPlaying) {
      scrollToWord(to, false)
      // Paragraphs rendered lazily can shift once on screen: settle again.
      requestAnimationFrame(() => scrollToWord(to, false))
      lastFollowedIndex.current = to
      lastFollowedParagraph.current = currentParagraph
    } else if (to - lastFollowedIndex.current >= 8 || currentParagraph !== lastFollowedParagraph.current) {
      lastFollowedParagraph.current = currentParagraph
      scrollToWord(to, true)
      lastFollowedIndex.current = to
    }
  }

  useLayoutEffect(() => {
    follow(previousIndex.current, currentIndex)
    previousIndex.current = currentIndex
  }, [currentIndex, paragraphs])

  useEffect(() => {
    // Resuming after looking around: snap back to the word.
    if (isPlaying) {
      followPausedUntil.current = 0
      lastFollowedParagraph.current = -1
      follow(-1, currentIndex)
    }
  }, [isPlaying])

  // Let the reader look around; follow again shortly after.
  const pauseFollowing = () => {
    followPausedUntil.current = Date.now() + 4000
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const direct = target.closest<HTMLElement>('[data-i]')
    if (direct) return props.onSelect(Number(direct.dataset.i))
    const paragraph = target.closest<HTMLElement>('[data-start]')
    if (!paragraph) return
    const offset = caretOffset(event, paragraph)
    if (offset === undefined) return
    const start = Number(paragraph.dataset.start)
    const before = (paragraph.querySelector('.para-text')?.textContent ?? '').slice(0, offset)
    const wordsBefore = before.split(' ').length - 1
    props.onSelect(start + wordsBefore)
  }

  return (
    <div
      ref={scroller}
      class={props.side ? 'text-panel side' : 'text-panel'}
      style={props.style}
      onWheel={pauseFollowing}
      onTouchMove={pauseFollowing}
      onPointerDown={pauseFollowing}
      onKeyDown={pauseFollowing}
      onClick={onClick}
    >
      <div class="text-panel-inner" style={{ font: cssFont(props.font, TEXT_SIZE, false) }}>
        {paragraphs.map(([start, end], index) => (
          <Paragraph
            key={start}
            tokens={tokens}
            start={start}
            end={end}
            chapterTitle={titles.get(start)}
            highlight={index === currentParagraph ? currentIndex : -1}
            isRead={index < currentParagraph}
          />
        ))}
      </div>
    </div>
  )
}

interface ParagraphProps {
  tokens: Token[]
  start: number
  end: number
  chapterTitle?: string
  /** Current word, when it's in this paragraph; otherwise -1. */
  highlight: number
  /** Paragraph entirely before the current word. */
  isRead: boolean
}

const Paragraph = memo(function Paragraph({ tokens, start, end, chapterTitle, highlight, isRead }: ParagraphProps) {
  const words = tokens.slice(start, end).map(t => t.text)
  const text = words.join(' ')
  // The paragraph is the chapter heading itself.
  const isHeading = chapterTitle !== undefined && text.toLocaleLowerCase() === chapterTitle.toLocaleLowerCase()

  return (
    <div class={`para${isRead ? ' read' : ''}${isHeading ? ' heading' : ''}`} data-start={start}>
      {chapterTitle && !isHeading && <div class="chapter-mark">{chapterTitle}</div>}
      {highlight < 0 ? (
        <p class="para-text">{text}</p>
      ) : (
        <p class="para-text">
          {words.map((word, offset) => {
            const index = start + offset
            const cls = index === highlight ? 'w current' : index < highlight ? 'w before' : 'w'
            return (
              <Fragment key={index}>
                {offset > 0 && ' '}
                <span class={cls} data-i={index}>
                  {word}
                </span>
              </Fragment>
            )
          })}
        </p>
      )}
    </div>
  )
})

/** Character offset of a click inside `paragraph`'s text node. */
function caretOffset(event: MouseEvent, paragraph: HTMLElement): number | undefined {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  let node: Node | undefined
  let offset: number | undefined
  const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY)
  if (position) {
    node = position.offsetNode
    offset = position.offset
  } else {
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
    if (range) {
      node = range.startContainer
      offset = range.startOffset
    }
  }
  if (!node || offset === undefined || !paragraph.contains(node) || node.nodeType !== Node.TEXT_NODE) return undefined
  return offset
}
