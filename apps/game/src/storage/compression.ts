/**
 * Gzip and Base64 for the saves sent to the DomoThib server: a serialized game is about
 * eleven times smaller once gzipped (docs/07-architecture.md, 7.5). Browser APIs only
 * (CompressionStream: Chrome 80, Safari 16.4, Firefox 113; also in Node 18).
 */

export function canCompress(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Bytes per `String.fromCharCode` call: stays under the engines' argument limits. */
const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Gzips a text and gives it back in Base64 (plain ASCII: a valid save value). */
export async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** The text of `gzipToBase64`; rejects when the data is not valid. */
export async function gunzipFromBase64(data: string): Promise<string> {
  const stream = new Blob([fromBase64(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Size of a text in UTF-8 bytes, as the DomoThib server counts it. */
export function utf8Bytes(text: string): number {
  let size = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) size += 1;
    else if (code < 0x800) size += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair: one character of four bytes.
      size += 4;
      index += 1;
    } else size += 3;
  }
  return size;
}
