/**
 * Minimal TOTP implementation using Web Crypto API
 * No external dependencies required.
 */

function base32ToUint8Array(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/=+$/, '').toUpperCase();
  const len = clean.length;
  const out = new Uint8Array((len * 5) / 8 | 0);
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < len; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}

export async function generateTOTP(secret: string, interval = 30): Promise<string> {
  try {
    const key = base32ToUint8Array(secret);
    const counter = Math.floor(Date.now() / 1000 / interval);
    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    
    // Write counter as 64-bit big-endian
    counterView.setUint32(4, counter); // Use lower 32 bits

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      counterBuffer
    );

    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, '0');
  } catch (err) {
    console.error('TOTP Generation failed:', err);
    return '000000';
  }
}

export function getRemainingSeconds(interval = 30): number {
  return interval - (Math.floor(Date.now() / 1000) % interval);
}
