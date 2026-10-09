// Ported from the iOS app's TextDecoding, HTMLText, PDFText, DocumentExtractor,
// EPUB and storage tests.

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { tokenize } from '../core/tokenizer'
import { isChapterHeading, plainText, prepareText } from './document'
import { parseEPUB } from './epub'
import { decodeEntities, htmlArticle, htmlParagraphs } from './html'
import { pdfParagraphs } from './pdfText'
import { decodeText } from './textDecoding'

describe('Text decoding', () => {
  it('decodes UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('perché è così'))).toBe('perché è così')
  })

  it('strips the UTF-8 byte-order mark', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ciao')]))).toBe('ciao')
  })

  it('decodes UTF-16 with a BOM', () => {
    const text = 'città'
    const bytes = [0xff, 0xfe]
    for (const c of text) {
      const code = c.charCodeAt(0)
      bytes.push(code & 0xff, code >> 8)
    }
    expect(decodeText(new Uint8Array(bytes))).toBe('città')
  })

  it('falls back to Windows-1252', () => {
    const bytes = [0x70, 0x65, 0x72, 0x63, 0x68, 0xe9, 0x20, 0x93, 0x73, 0xec, 0x94]
    expect(decodeText(new Uint8Array(bytes))).toBe('perché “sì”')
  })

  it('falls back to Latin-1 for bytes undefined in 1252', () => {
    const decoded = decodeText(new Uint8Array([0xe8, 0x81]))
    expect(decoded[0]).toBe('è')
    expect(decoded.length).toBe(2)
  })
})

describe('HTML', () => {
  it('extracts paragraphs and drops scripts', () => {
    const html = `<html><head><title>T</title><style>p{}</style></head><body>
<nav>Menu Home About</nav>
<p>First <b>bold</b> paragraph.</p><script>alert(1)</script>
<p>Second&nbsp;one &amp; more</p><br/>
</body></html>`
    expect(htmlParagraphs(html)).toEqual(['First bold paragraph.', 'Second one & more'])
  })

  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&egrave; &#233; &#x2014; &laquo;ok&raquo; &bogus;')).toBe('è é — «ok» &bogus;')
  })

  it('prefers the article element and the Open Graph title', () => {
    const html = `<html><head><meta property="og:title" content="Il titolo &amp; altro"><title>Site</title></head>
<body><div>Cookie banner with some long text here</div>
<article><h1>Heading</h1><p>This is the actual article body text.</p></article></body></html>`
    const article = htmlArticle(html)
    expect(article.title).toBe('Il titolo & altro')
    expect(article.paragraphs).toEqual(['This is the actual article body text.'])
  })
})

describe('PDF text', () => {
  it('joins wrapped lines and repairs hyphenation', () => {
    const page = `This is a long line of text that wraps onto the next one and keeps on
going with a hyphen- ated word in the middle of the para-
graph until it finally ends here.
12`
    const { paragraphs, pageStarts } = pdfParagraphs([page])
    expect(paragraphs).toEqual([
      'This is a long line of text that wraps onto the next one and keeps on going with a hyphen- ated word in the middle of the paragraph until it finally ends here.',
    ])
    expect(pageStarts).toEqual([0])
  })

  it('closes a paragraph at a short line ending a sentence', () => {
    const page = `A first paragraph that is quite long and fills most of the line width.
Short end.
A second paragraph that is also long enough to look like body text ok.`
    const { paragraphs, pageStarts } = pdfParagraphs([page, 'Next page text.'])
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].endsWith('width. Short end.')).toBe(true)
    expect(paragraphs[1].endsWith('body text ok. Next page text.')).toBe(true)
    expect(pageStarts).toEqual([0, 1])
  })
})

describe('Documents', () => {
  it.each(['Capitolo 3', 'CHAPTER IV', 'Parte prima', 'Prologo', 'Chapter 12 – The end'])('recognises %s', line => {
    expect(isChapterHeading(line)).toBe(true)
  })

  it('ignores prose mentioning chapters', () => {
    expect(isChapterHeading('Nel capitolo precedente abbiamo visto come funziona il metodo.')).toBe(false)
  })

  it('finds chapters in plain text', () => {
    const document = plainText('Intro.\n\nCapitolo 1\n\nTesto.\n\nCapitolo 2\n\nAltro.')
    expect(document.chapters.map(c => c.title)).toEqual(['Capitolo 1', 'Capitolo 2'])
    expect(document.chapters.map(c => c.paragraphIndex)).toEqual([1, 3])
  })

  it('maps chapter starts to the right words', () => {
    const prepared = prepareText(
      plainText('Intro breve.\n\nCapitolo 1\n\nprecipitevolissimevolmente detto.\n\nCapitolo 2\n\nFine.'),
    )
    const tokens = tokenize(prepared.text)
    expect(prepared.wordCount).toBe(tokens.length)
    expect(prepared.chapters!.map(c => tokens[c.wordIndex].text)).toEqual(['Capitolo', 'Capitolo'])
    expect(tokens[prepared.chapters![1].wordIndex + 1].text).toBe('2')
  })
})

describe('EPUB', () => {
  const epub = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])))

  const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`

  it('reads the spine in order with EPUB 3 nav titles', () => {
    const data = epub({
      'META-INF/container.xml': container,
      'OEBPS/content.opf': `<package><metadata><dc:title>Il libro</dc:title></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
      'OEBPS/nav.xhtml': `<html><body><nav epub:type="toc"><ol>
<li><a href="text/ch%201.xhtml">Primo</a></li><li><a href="text/ch2.xhtml#x">Secondo</a></li></ol></nav></body></html>`,
      'OEBPS/text/ch 1.xhtml': '<html><body><h1>Uno</h1><p>Testo del primo.</p></body></html>',
      'OEBPS/text/ch2.xhtml': '<html><body><p>Testo del secondo.</p></body></html>',
    })
    const document = parseEPUB(data)
    expect(document.title).toBe('Il libro')
    expect(document.paragraphs).toEqual(['Uno', 'Testo del primo.', 'Testo del secondo.'])
    expect(document.chapters).toEqual([
      { title: 'Primo', paragraphIndex: 0 },
      { title: 'Secondo', paragraphIndex: 2 },
    ])
  })

  it('falls back to the EPUB 2 NCX', () => {
    const data = epub({
      'META-INF/container.xml': container,
      'OEBPS/content.opf': `<package><manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="a" href="a.html" media-type="application/xhtml+xml"/>
</manifest><spine toc="ncx"><itemref idref="a"/></spine></package>`,
      'OEBPS/toc.ncx': `<ncx><navMap><navPoint><navLabel><text>Capitolo A</text></navLabel><content src="a.html"/></navPoint></navMap></ncx>`,
      'OEBPS/a.html': '<html><body><p>Contenuto.</p></body></html>',
    })
    expect(parseEPUB(data).chapters).toEqual([{ title: 'Capitolo A', paragraphIndex: 0 }])
  })

  it('rejects damaged files', () => {
    expect(() => parseEPUB(new Uint8Array([1, 2, 3]))).toThrow()
  })
})
