// Mono's site: shared by the landing page and the brand guidelines.

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
