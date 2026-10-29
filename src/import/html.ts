// Minimal HTML → readable paragraphs conversion, shared by the EPUB and the
// web-page importers. Regex-based: we only need the prose, not a DOM.

const replace = (pattern: string, text: string, replacement: string) =>
  text.replace(new RegExp(pattern, 'gis'), replacement)

/** First capture group of the first match. */
export function firstMatch(pattern: string, text: string): string | undefined {
  return new RegExp(pattern, 'is').exec(text)?.[1]
}

/** All matches, each as its capture groups. */
export function allMatches(pattern: string, text: string): string[][] {
  return [...text.matchAll(new RegExp(pattern, 'gis'))].map(m => m.slice(1).map(g => g ?? ''))
}

/** Readable paragraphs from an HTML fragment or document. */
export function htmlParagraphs(html: string): string[] {
  let text = html
  text = replace('<!--.*?-->', text, ' ')
  text = replace(
    '<(script|style|head|nav|header|footer|aside|form|noscript|svg|button|select|figure|iframe)\\b[^>]*>.*?</\\1\\s*>',
    text,
    ' ',
  )
  text = replace(
    '</?(p|div|h[1-6]|li|ul|ol|blockquote|section|article|main|br|hr|tr|table|pre|dd|dt|dl)\\b[^>]*>',
    text,
    '\n\n',
  )
  text = replace('<[^>]+>', text, '')
  text = decodeEntities(text)
  return text
    .split('\n\n')
    .map(p => p.split(/\s+/u).filter(Boolean).join(' '))
    .filter(Boolean)
}

/**
 * Title and body paragraphs of a web page, preferring the `<article>` /
 * `<main>` element so menus and footers don't end up in the reading.
 */
export function htmlArticle(html: string): { title?: string; paragraphs: string[] } {
  const titleSource = metaContent('og:title', html) ?? firstMatch('<title[^>]*>(.*?)</title>', html)
  const title = titleSource !== undefined ? decodeEntities(titleSource).trim() : undefined
  const body =
    firstMatch('<article\\b[^>]*>(.*)</article>', html) ??
    firstMatch('<main\\b[^>]*>(.*)</main>', html) ??
    firstMatch('<body\\b[^>]*>(.*)</body>', html) ??
    html
  // Drop very short fragments (bylines, share buttons, captions).
  const paragraphs = htmlParagraphs(body)
  const substantial = paragraphs.filter(p => p.split(' ').length >= 4)
  return { title: title || undefined, paragraphs: substantial.length ? substantial : paragraphs }
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  shy: '',
  copy: '©',
  deg: '°',
  agrave: 'à',
  aacute: 'á',
  egrave: 'è',
  eacute: 'é',
  igrave: 'ì',
  iacute: 'í',
  ograve: 'ò',
  oacute: 'ó',
  ugrave: 'ù',
  uacute: 'ú',
  Agrave: 'À',
  Egrave: 'È',
  Eacute: 'É',
  Igrave: 'Ì',
  Ograve: 'Ò',
  Ugrave: 'Ù',
  ccedil: 'ç',
  ntilde: 'ñ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  szlig: 'ß',
  euro: '€',
  middot: '·',
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, name: string) => {
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X'
      const value = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
      try {
        return String.fromCodePoint(value)
      } catch {
        return match
      }
    }
    return NAMED[name] ?? match
  })
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function metaContent(property: string, html: string): string | undefined {
  const pattern = `<meta[^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]*content=["']([^"']*)["']`
  const value = firstMatch(pattern, html)
  return value ? decodeEntities(value) || undefined : undefined
}
