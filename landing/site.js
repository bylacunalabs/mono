// Mono's site: shared by the landing page and the brand guidelines.

/** The Optimal Recognition Point, as in the app (src/core/orp.ts). */
function orpParts(word) {
  const isLetter = c => /[\p{L}\p{N}]/u.test(c)
  const forLength = n => (n <= 1 ? 0 : n <= 3 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : n <= 13 ? 4 : Math.round(n * 0.3))
  const c = Array.from(word)
  const first = c.findIndex(isLetter)
  const last = c.findLastIndex(isLetter)
  const i = Math.min(first < 0 ? forLength(c.length) : first + forLength(last - first + 1), c.length - 1)
  return { prefix: c.slice(0, i).join(''), orp: c[i], suffix: c.slice(i + 1).join('') }
}

/** Shows `word` in a .reticle, its focus letter on the centre line. */
function showWord(reticle, word) {
  const { prefix, orp, suffix } = orpParts(word)
  const [pre, focus, post] = reticle.querySelectorAll('.word span')
  pre.textContent = prefix
  focus.textContent = orp
  post.textContent = suffix
  reticle.style.setProperty('--pre', Array.from(prefix).length)
  reticle.style.setProperty('--suf', Array.from(suffix).length)
}

document.querySelectorAll('.reticle[data-word]').forEach(r => showWord(r, r.dataset.word))

// The navigation's border once the page scrolls.
const nav = document.querySelector('.nav')
if (nav) addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true })

// Sections fade in as they come into view.
const revealer = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('shown')
      revealer.unobserve(entry.target)
    }
  },
  { rootMargin: '0px 0px -8% 0px' },
)
document.querySelectorAll('.reveal').forEach(el => revealer.observe(el))
