/**
 * Carrying a design inside its own link.
 *
 * A headset can only fetch what is on a public URL, and a visitor cannot
 * upload to this site. But the split is lopsided: the model is tens of
 * megabytes and already hosted, while the design on top of it — hinges,
 * materials, lights, placements — is a kilobyte or two. Small enough to
 * travel in the address itself.
 *
 * So the link names a hosted model and carries the design with it. Nothing is
 * stored anywhere: the code *is* the design, and a different design is
 * different text, which draws a different code.
 */

/** Base64 that survives a URL: no +, / or = to be escaped or truncated. */
function toUrlBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlBase64(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function squeeze(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(
    format === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip')
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Is this browser able to pack a design into a link? */
export const canCarry = () => typeof CompressionStream === 'function';

/**
 * @param {object} project  the value of projectJSON()
 * @returns {Promise<string>} url-safe text, roughly a kilobyte
 */
export async function packDesign(project) {
  const json = new TextEncoder().encode(JSON.stringify(project));
  return toUrlBase64(await squeeze(json, 'gzip'));
}

/** @returns {Promise<object>} the project this text was made from */
export async function unpackDesign(text) {
  const raw = await squeeze(fromUrlBase64(text), 'gunzip');
  return JSON.parse(new TextDecoder().decode(raw));
}

/**
 * How much a QR code can hold before it is too dense to read off a screen.
 * The encoder tops out far higher, but those codes need a steady hand and a
 * good camera — a headset held at arm's length is neither.
 */
export const QR_COMFORTABLE = 1200;
