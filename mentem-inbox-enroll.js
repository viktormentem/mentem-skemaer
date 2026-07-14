// mentem-inbox-enroll.js: klient-halvdel af den sikre klient-inbox (lag 1 / Batch 1B).
// Custody-fundament + enroll-drivere. Spec: Projekt_Praksis/noter/spec-sikker-klient-inbox-lag1-2026-07-13.md
// §3 (custody) + §4 (krypto). Modpart (allerede bygget): PsykologInvitation/ingest-worker/src/inbox.js.
//
// KONTRAKT (maa ALDRIG brydes):
//   1. Per-enheds custody: privatnoeglen forlader ALDRIG denne enheds IndexedDB uwrappet. Kun den
//      PUBLIC enheds-noegle registreres paa workeren.
//   2. Krypto-familie uaendret: X25519 (enheds-noegle) + wrap = HKDF-SHA256 -> AES-256-GCM.
//   3. Cross-device-PRF antages ALDRIG: PRF-wrap er enheds-lokal + opportunistisk; passphrase/uwrapped
//      er de dokumenterede fallbacks (spec §3.2, roed-team Hul 1).
//
// X25519-primitiven genbruger den byte-eksakte ren-JS-fallback (mentem-x25519-fallback.js) som
// custody-repraesentation (raa 32-byte skalar), saa privatnoeglen kan wrappes + lagres + bruges til
// ECDH. WebCrypto-X25519 bruges som primaer platform-primitiv naar den findes (feature-gate).

import { x25519 } from './mentem-x25519-fallback.js';

// Delt X25519-overflade (samme metodenavne som @noble/curves + WebCrypto-byte-eksakt).
export const x25519Delt = x25519;

// ── base64url-helpers (browser: atob/btoa; node: Buffer) ─────────────────────────────────────
function bytesToB64url(bytes) {
  const u = new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64url');
  let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(t, 'base64'));
  const bin = atob(t); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function subtleTilgaengelig() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  return !!s && globalThis.isSecureContext !== false;
}
// Typet fejl, saa klient-UI viser "aabn i Chrome/Safari" i stedet for en generisk krypto-fejl
// (samme etos som mentemEncrypt i mentem-skema-core.js).
function kryptoUnsupported(besked) {
  const err = new Error(besked);
  err.name = 'CryptoUnsupportedError';
  return err;
}

let _wcX25519 = null;
async function x25519WebCryptoStoettet() {
  if (_wcX25519 !== null) return _wcX25519;
  try {
    if (!subtleTilgaengelig()) { _wcX25519 = false; return false; }
    await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    _wcX25519 = true;
  } catch (_e) { _wcX25519 = false; }
  return _wcX25519;
}

/// "Kan enheden overhovedet enrolle?" Kraever WebCrypto subtle (til SHA-256/HKDF/AES-GCM + wrap).
/// X25519-hullet i gamle browsere daekkes af ren-JS-fallbacken -> subtle raekker. WebAuthn tjekkes
/// separat af UI'et (navigator.credentials). Bruges til banner/fejl-besked.
export async function kryptoStoettetInbox() {
  return subtleTilgaengelig();
}

/// key_id = foerste 8 hex (4 bytes) af SHA-256(raa 32-byte pubkey). Samme aflednings-regel som
/// PINNED_KEY_ID i mentem-skema-core.js, saa Mentem/worker kan matche noegle-version.
export async function afledKeyId(pubBytes) {
  const dig = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', pubBytes));
  return [...dig.slice(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/// Generér enhedens X25519-noeglepar. WebCrypto-X25519 er primaer (platform-primitiv); ren-JS er
/// fallback (byte-eksakt). Returnerer BAADE raa priv (til custody-wrap) og pub + afledt metadata.
/// opts.tvingFallback tvinger ren-JS-stien (til test/aeldre-browser-sti).
export async function genererEnhedsNoegle(opts = {}) {
  if (!subtleTilgaengelig()) throw kryptoUnsupported('WebCrypto (subtle) er ikke tilgaengelig i denne browser');
  let priv;
  const brugFallback = opts.tvingFallback === true || !(await x25519WebCryptoStoettet());
  if (brugFallback) {
    priv = x25519.utils.randomPrivateKey();
  } else {
    try {
      const kp = await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const jwk = await globalThis.crypto.subtle.exportKey('jwk', kp.privateKey);
      priv = b64urlToBytes(jwk.d);
    } catch (_e) {
      priv = x25519.utils.randomPrivateKey();   // robusthed: fald til ren-JS ved eksport-hul
    }
  }
  // Public afledes ALTID via ren-JS (klamret skalar -> byte-eksakt mod WebCrypto/CryptoKit), saa den
  // lagrede raa priv og den registrerede pub hoerer garanteret sammen (ECDH konsistent).
  const pub = x25519.getPublicKey(priv);
  const keyId = await afledKeyId(pub);
  return { priv, pub, x25519_pub: bytesToB64url(pub), keyId, deviceId: globalThis.crypto.randomUUID() };
}

// ── At-rest wrapping (privatnoeglen wrappes FOER den roerer IndexedDB) ────────────────────────
// wrapKey = 32 byte noegle-materiale fra en tier (PRF / passphrase / uwrapped-erstatning). HKDF
// domaene-separerer materialet -> AES-256-GCM-noegle, saa raa PRF/passphrase-output aldrig genbruges.
async function aesFraWrapKey(wrapKey32) {
  const subtle = globalThis.crypto.subtle;
  const ikm = await subtle.importKey('raw', wrapKey32, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('Mycel-inbox-custody-wrap-v1') },
    ikm, 256);
  return subtle.importKey('raw', new Uint8Array(bits), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/// Wrap raa privatnoegle -> opakt {v, alg, nonce, ct}. Indeholder ALDRIG klartekst-privat.
export async function wrapPrivat(privBytes, wrapKey32) {
  if (!subtleTilgaengelig()) throw kryptoUnsupported('WebCrypto (subtle) er ikke tilgaengelig i denne browser');
  const aes = await aesFraWrapKey(wrapKey32);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, privBytes));
  return { v: 1, alg: 'AES-256-GCM', nonce: bytesToB64url(nonce), ct: bytesToB64url(ct) };
}

/// Unwrap -> raa privatnoegle. Forkert wrapKey => AES-GCM-auth fejler (kaster) => afvist.
export async function unwrapPrivat(wrapped, wrapKey32) {
  const aes = await aesFraWrapKey(wrapKey32);
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlToBytes(wrapped.nonce) }, aes, b64urlToBytes(wrapped.ct));
  return new Uint8Array(pt);
}

/// TIER 1 (primaer): enheds-lokal WebAuthn-PRF-output (32B) -> wrapKey. Cross-device-stabilitet er
/// IRRELEVANT fordi noeglen er per-enhed (spec §3.2).
export async function wrapKeyFraPRF(prfOutput32) {
  const subtle = globalThis.crypto.subtle;
  const ikm = await subtle.importKey('raw', prfOutput32, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('Mycel-inbox-prf-wrapkey-v1') },
    ikm, 256);
  return new Uint8Array(bits);
}

/// TIER 2 (fallback): passphrase -> wrapKey via PBKDF2-SHA256 (WebCrypto-native).
/// FASE-B (ratchet): opgradér til Argon2id foer prod-klient (register-raekke). PBKDF2 valgt fordi
/// WebCrypto mangler Argon2id, en ren-JS Argon2id er en uverificeret static-site-afhaengighed paa en
/// sikkerheds-sti, og at-rest-wrappen er enheds-lokal (aldrig et wire-format). Se rapport for D1.
export const PASSPHRASE_KDF_ITERATIONS = 600000;
export async function wrapKeyFraPassphrase(passphrase, salt) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSPHRASE_KDF_ITERATIONS }, base, 256);
  return new Uint8Array(bits);
}

// ── Custody-store (IndexedDB i browseren; injiceret hukommelses-store i test) ─────────────────
const IDB_DB = 'mycel-inbox';
const IDB_STORE = 'custody';
const IDB_KEY = 'aktiv-enhed';   // v1: én aktiv enhed pr. klient (spec §3.2)

/// Injicérbar hukommelses-store (test-dobbelt for IndexedDB; ingen mock af produktions-klasse).
export function opretHukommelsesStore() {
  let rec = null;
  return {
    async put(r) { rec = JSON.parse(JSON.stringify(r)); },
    async get() { return rec ? JSON.parse(JSON.stringify(rec)) : null; },
  };
}

/// Rigtig IndexedDB-store (browser). Gemmer KUN {deviceId, keyId, x25519_pub, tier, wrapped, createdAt}
/// - privatnoeglen ligger wrappet i `wrapped`. IKKE localStorage (spec: IndexedDB).
export function opretIndexedDBStore() {
  function aabn() {
    return new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return {
    async put(r) {
      const db = await aabn();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(r, IDB_KEY);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async get() {
      const db = await aabn();
      const r = await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const rq = tx.objectStore(IDB_STORE).get(IDB_KEY);
        rq.onsuccess = () => resolve(rq.result || null); rq.onerror = () => reject(rq.error);
      });
      db.close();
      return r;
    },
  };
}

export async function gemCustody(store, record) { await store.put(record); }
export async function hentCustody(store) { return store.get(); }
