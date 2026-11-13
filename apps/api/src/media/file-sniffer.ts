/**
 * Detects file types from their leading bytes ("magic numbers") so uploads
 * cannot lie about their content type (ADR-023), and reads image dimensions
 * from headers without decoding images.
 */

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, text: string, offset = 0) =>
  buf.length >= offset + text.length &&
  buf.toString('latin1', offset, offset + text.length) === text;

function isUtf8Text(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(
      // A multi-byte character may be cut at the sample boundary.
      sample.length === 8192 ? sample.subarray(0, 8188) : sample,
    );
    return true;
  } catch {
    return false;
  }
}

/** Returns the detected MIME type, 'text' for plain UTF-8 text, or null. */
export function sniffMimeType(buf: Buffer): string | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(buf, 'GIF87a') || ascii(buf, 'GIF89a')) return 'image/gif';
  if (ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8)) return 'image/webp';
  if (ascii(buf, 'RIFF') && ascii(buf, 'WAVE', 8)) return 'audio/wav';
  if (ascii(buf, '%PDF-')) return 'application/pdf';
  if (ascii(buf, 'ftyp', 4)) return 'video/mp4';
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii(buf, 'OggS')) return 'audio/ogg';
  if (ascii(buf, 'ID3') || (buf.length > 1 && buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) {
    return 'audio/mpeg';
  }
  if (isUtf8Text(buf)) return 'text';
  return null;
}

/** True when the sniffed content matches the declared MIME type. */
export function contentMatches(declared: string, sniffed: string | null): boolean {
  if (sniffed === null) return false;
  if (sniffed === 'text') return declared === 'text/plain' || declared === 'text/csv';
  return sniffed === declared;
}

export function imageDimensions(
  buf: Buffer,
  mime: string,
): { width: number; height: number } | null {
  try {
    switch (mime) {
      case 'image/png':
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      case 'image/gif':
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      case 'image/webp': {
        const chunk = buf.toString('latin1', 12, 16);
        if (chunk === 'VP8 ') {
          return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        }
        if (chunk === 'VP8L') {
          const bits = buf.readUInt32LE(21);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (chunk === 'VP8X') {
          return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
        }
        return null;
      }
      case 'image/jpeg': {
        let offset = 2;
        while (offset + 9 < buf.length) {
          if (buf[offset] !== 0xff) return null;
          const marker = buf[offset + 1]!;
          const length = buf.readUInt16BE(offset + 2);
          // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC).
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
          }
          offset += 2 + length;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
