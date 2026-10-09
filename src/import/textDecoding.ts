// Turns raw bytes from an imported file into a string without mangling
// accented letters. Plenty of European texts are still saved as
// Windows-1252 or Latin-1, and a lossy UTF-8 decode would turn every "è"
// into "�".

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((b, i) => bytes[i] === b)

/** Bytes Windows-1252 leaves unassigned. */
const UNASSIGNED_1252 = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d])

export function decodeText(bytes: Uint8Array): string {
  // Byte-order marks are unambiguous.
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes.subarray(2))

  // Strict UTF-8 fails on any invalid sequence, so success is reliable.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // fall through
  }
  // Windows-1252 covers curly quotes and ellipses; Latin-1 maps every byte.
  // (Browsers decode "latin1" as windows-1252, so the unassigned bytes are
  // mapped by hand.)
  if (!bytes.some(b => UNASSIGNED_1252.has(b))) return new TextDecoder('windows-1252').decode(bytes)
  let result = ''
  for (const b of bytes) result += String.fromCharCode(b)
  return result
}
