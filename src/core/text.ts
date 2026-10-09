// Character helpers matching Swift's Character properties closely enough for
// Latin-script text. Strings are handled as arrays of code points.

export const chars = (text: string): string[] => Array.from(text)

export const isLetter = (c: string) => /\p{L}/u.test(c)
export const isNumber = (c: string) => /\p{N}/u.test(c)
export const isLetterOrNumber = (c: string) => /[\p{L}\p{N}]/u.test(c)
export const isLowercase = (c: string) => /\p{Ll}/u.test(c)
export const isWhitespace = (c: string) => /\s/u.test(c)

/** Splits on runs of whitespace, dropping empty pieces. */
export const words = (text: string): string[] => text.split(/\s+/u).filter(Boolean)

/** Length in characters (code points), like Swift's `count`. */
export const length = (text: string) => chars(text).length
