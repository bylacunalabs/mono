// Numbers and plural forms in a catalog's own locale.

export function formatters(locale: string) {
  const numbers = new Intl.NumberFormat(locale)
  const rules = new Intl.PluralRules(locale)
  const number = (n: number) => numbers.format(n)
  return {
    number,
    /** The form for `n`: Italian and English both need only one and other. */
    plural: (n: number, one: string, other: string) => (rules.select(n) === 'one' ? one : other),
    /** "1 word", "1,234 words". */
    count: (n: number, one: string, other: string) => `${number(n)} ${rules.select(n) === 'one' ? one : other}`,
  }
}
