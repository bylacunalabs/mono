// The landing page's install tabs: iPhone and iPad, Android, Computer.
// The tab matching the visitor's device opens first. The reader demo is demo.ts.

const tabs = Array.from(document.querySelectorAll('.tab'))

function pick(id) {
  for (const tab of tabs) {
    const on = tab.id === `tab-${id}`
    tab.setAttribute('aria-selected', String(on))
    document.getElementById(`panel-${tab.id.slice(4)}`).hidden = !on
  }
}

for (const tab of tabs) tab.addEventListener('click', () => pick(tab.id.slice(4)))

const ua = navigator.userAgent
if (/Android/i.test(ua)) pick('android')
else if (/iPhone|iPad|iPod/i.test(ua)) pick('ios')
else if (/Macintosh|Windows|Linux|CrOS/i.test(ua) && navigator.maxTouchPoints <= 1) pick('desktop')
