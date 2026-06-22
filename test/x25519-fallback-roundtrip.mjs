// x25519-fallback-roundtrip.mjs: verificerer den rene-JS X25519-fallback BYTE-EKSAKT.
//
// 🔴 SHIP-GATE (JS-side): denne SKAL være grøn FØR X25519_FALLBACK_AKTIV flippes til true.
// Den endelige JS→CryptoKit-gate køres app-side (StaticSiteCryptoRoundTripTests) + Viktor-GO.
//
// Beviser:
//   1. RFC 7748 §5.2/§6.1 known-answer-vektorer (impl-korrekthed).
//   2. pure-JS shared secret == Node WebCrypto-X25519 shared secret (oracle ≡ CryptoKit/RFC 7748).
//   3. Fallback-ECDH + WebCrypto HKDF/AES-GCM → container dekrypteres af WebCrypto-X25519-stien
//      (= CryptoKit-stien) → klartekst matcher. Begge ECDH-stier giver identisk-dekrypterbar output.

import { x25519 } from '../mentem-x25519-fallback.js';

const subtle = globalThis.crypto.subtle;
const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const eq = (a, b) => bytesToHex(a) === bytesToHex(b);

let fejl = 0;
const check = (navn, ok) => { console.log((ok ? '  ✓ ' : '  ✗ ') + navn); if (!ok) fejl++; };

// ── 1. RFC 7748 §5.2 known-answer ──────────────────────────────────────────
check('RFC 7748 §5.2 vektor 1', bytesToHex(x25519.scalarMult(
  hexToBytes('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'),
  hexToBytes('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c'),
)) === 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');

check('RFC 7748 §5.2 vektor 2', bytesToHex(x25519.scalarMult(
  hexToBytes('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d'),
  hexToBytes('e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493'),
)) === '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957');

// ── 2. RFC 7748 §6.1 Diffie-Hellman (base-point + agreement) ────────────────
const aPriv = hexToBytes('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
const bPriv = hexToBytes('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
const aPub = x25519.getPublicKey(aPriv);
const bPub = x25519.getPublicKey(bPriv);
check('RFC §6.1 Alice public', bytesToHex(aPub) === '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
check('RFC §6.1 Bob public', bytesToHex(bPub) === 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
const sAB = x25519.getSharedSecret(aPriv, bPub);
const sBA = x25519.getSharedSecret(bPriv, aPub);
check('RFC §6.1 shared agree + KAT', eq(sAB, sBA)
  && bytesToHex(sAB) === '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');

// ── 3. Cross-check mod Node WebCrypto-X25519 (oracle) ───────────────────────
const recip = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
const recipPubRaw = new Uint8Array(await subtle.exportKey('raw', recip.publicKey));
const ephPriv = x25519.utils.randomPrivateKey();
const ephPub = x25519.getPublicKey(ephPriv);
const sharedJS = x25519.getSharedSecret(ephPriv, recipPubRaw);
const ephPubWC = await subtle.importKey('raw', ephPub, { name: 'X25519' }, false, []);
const sharedWC = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: ephPubWC }, recip.privateKey, 256));
check('pure-JS shared == WebCrypto shared (random keypair)', eq(sharedJS, sharedWC));

// ── 4. Fuld krypter(fallback)→dekrypter(WebCrypto) roundtrip ────────────────
const INFO = new TextEncoder().encode('TherapyCopilot-E2E-Export-v1');
async function hkdfAesKey(shared, salt, usage) {
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const keyBits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, ikm, 256);
  return subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, [usage]);
}
const ecdhFallback = async (pub) => {
  const e = x25519.utils.randomPrivateKey();
  return { ephPubRaw: x25519.getPublicKey(e), shared: x25519.getSharedSecret(e, pub) };
};
const ecdhWebCrypto = async (pub) => {
  const recipientPub = await subtle.importKey('raw', pub, { name: 'X25519' }, false, []);
  const e = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  return {
    ephPubRaw: new Uint8Array(await subtle.exportKey('raw', e.publicKey)),
    shared: new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: recipientPub }, e.privateKey, 256)),
  };
};
async function krypter(ecdh, pub, obj) {
  const { ephPubRaw, shared } = await ecdh(pub);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await hkdfAesKey(shared, salt, 'encrypt');
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const combined = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, pt));
  return { ephemeralPublicKey: ephPubRaw, encryptedData: combined.slice(0, -16), tag: combined.slice(-16), nonce, salt };
}
// Dekryptér PRÆCIS som CryptoKit/WebCrypto-stien: X25519(ephPub, recipientPriv) → HKDF → AES-GCM.
async function dekrypterWC(c, recipientPriv) {
  const ephPub = await subtle.importKey('raw', c.ephemeralPublicKey, { name: 'X25519' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: ephPub }, recipientPriv, 256));
  const aesKey = await hkdfAesKey(shared, c.salt, 'decrypt');
  const combined = new Uint8Array([...c.encryptedData, ...c.tag]);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: c.nonce }, aesKey, combined);
  return new TextDecoder().decode(pt);
}

const klartekst = { skema: 'gad7', svar: [1, 2, 1, 0, 2, 1, 1], note: 'æøå-test' };
const cFallback = await krypter(ecdhFallback, recipPubRaw, klartekst);
const decFallback = await dekrypterWC(cFallback, recip.privateKey);
check('FALLBACK-container dekrypteres af WebCrypto-X25519-stien (≡CryptoKit)', decFallback === JSON.stringify(klartekst));

const cWC = await krypter(ecdhWebCrypto, recipPubRaw, klartekst);
const decWC = await dekrypterWC(cWC, recip.privateKey);
check('Kontrol: WebCrypto-container dekrypteres (sanity)', decWC === JSON.stringify(klartekst));

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl === 0) { console.log('\nx25519-fallback ✓: JS-side roundtrip grøn (CryptoKit-gate udestår, app-side).'); process.exit(0); }
console.log(`\nx25519-fallback ✗: ${fejl} fejl. Ship IKKE.`); process.exit(1);
