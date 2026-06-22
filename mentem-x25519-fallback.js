// mentem-x25519-fallback.js: ren-JS X25519 (RFC 7748) til browsere UDEN WebCrypto-X25519.
//
// HVORFOR: indlejrede/forældede Android-browsere (in-app SMS-browser, gammel System-WebView)
// mangler X25519 i crypto.subtle: også når subtle SELV findes. Denne fil leverer ECDH-delen
// i ren JS, så mentemEncrypt kan falde tilbage; HKDF + AES-GCM bliver på WebCrypto (bredt
// understøttet, også der hvor X25519 mangler).
//
// 🔴 KONTRAKT: outputtet (ephemeral public key + shared secret) er RÅ u-koordinat, little-endian
// (RFC 7748), 1:1 identisk med WebCrypto-`exportKey('raw')`/`deriveBits` og CryptoKit's
// Curve25519.KeyAgreement → byte-eksakt KOMPATIBEL ciphertext. INGEN ændring af krypto-format.
//
// VERIFICERET (test/x25519-fallback-roundtrip.mjs):
//   1. RFC 7748 §5.2 + §6.1 known-answer-testvektorer.
//   2. Cross-check mod Node WebCrypto-X25519 (oracle ≡ CryptoKit pr. RFC 7748).
//   3. Fallback-krypteret container dekrypteres af WebCrypto-X25519-stien.
// Den endelige JS→CryptoKit-gate køres app-side (StaticSiteCryptoRoundTripTests) FØR aktivering.
//
// Ren funktions-kerne (BigInt over feltet 2^255-19); ingen afhængigheder.

const P = (1n << 255n) - 19n;
const A24 = 121665n;

function mod(a) { let r = a % P; if (r < 0n) r += P; return r; }

// a^(p-2) mod p (Fermat-invers).
function inv(a) {
  let result = 1n, base = mod(a), e = P - 2n;
  while (e > 0n) { if (e & 1n) result = mod(result * base); base = mod(base * base); e >>= 1n; }
  return result;
}

function bytesToLE(b) { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
function leToBytes(n) { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; }

// RFC 7748 §5: scalar-clamping.
function decodeScalar(k) {
  const e = k.slice(0, 32); e[0] &= 248; e[31] &= 127; e[31] |= 64;
  return bytesToLE(e);
}
// RFC 7748 §5: u-koordinat: masker high bit, reducér mod p.
function decodeU(u) {
  const e = u.slice(0, 32); e[31] &= 127;
  return mod(bytesToLE(e));
}

// RFC 7748 §5: Montgomery-ladder X25519(k, u). Returnerer 32-byte rå u-koordinat (little-endian).
function scalarMult(kBytes, uBytes) {
  const k = decodeScalar(kBytes);
  const x1 = decodeU(uBytes);
  let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
  for (let t = 254; t >= 0; t--) {
    const kt = (k >> BigInt(t)) & 1n;
    swap ^= kt;
    if (swap === 1n) { let tmp = x2; x2 = x3; x3 = tmp; tmp = z2; z2 = z3; z3 = tmp; }
    swap = kt;
    const A = mod(x2 + z2), AA = mod(A * A);
    const B = mod(x2 - z2), BB = mod(B * B);
    const E = mod(AA - BB);
    const C = mod(x3 + z3), D = mod(x3 - z3);
    const DA = mod(D * A), CB = mod(C * B);
    const sumDC = mod(DA + CB), difDC = mod(DA - CB);
    x3 = mod(sumDC * sumDC);
    z3 = mod(x1 * mod(difDC * difDC));
    x2 = mod(AA * BB);
    z2 = mod(E * mod(AA + mod(A24 * E)));
  }
  if (swap === 1n) { let tmp = x2; x2 = x3; x3 = tmp; tmp = z2; z2 = z3; z3 = tmp; }
  return leToBytes(mod(x2 * inv(z2)));
}

const BASE_U = (() => { const b = new Uint8Array(32); b[0] = 9; return b; })();

// noble-kompatibel overflade (samme metodenavne som @noble/curves x25519).
export const x25519 = {
  scalarMult,
  getPublicKey(priv) { return scalarMult(priv, BASE_U); },
  getSharedSecret(priv, pub) { return scalarMult(priv, pub); },
  utils: {
    randomPrivateKey() { const b = new Uint8Array(32); globalThis.crypto.getRandomValues(b); return b; },
  },
};
