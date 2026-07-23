// VERA (custody-kerne) - klient-inbox lag 1 / Batch 1B.
// Beviser custody-fundamentet ISOLERET (ingen worker): X25519 enheds-noeglegen (WebCrypto primaer
// + ren-JS fallback), key_id-afledning, wrap/unwrap (PRF/passphrase/uwrapped tiers), IndexedDB-
// custody-roundtrip via injiceret store, og at privatnoeglen ALDRIG lagres i klartekst.
//
// Kontrakt (maa ALDRIG brydes): privatnoeglen forlader ALDRIG custody uwrappet paa disk; kun den
// PUBLIC enheds-noegle gaar til workeren. Krypto = X25519 -> (wrap: HKDF -> AES-256-GCM).
import {
  genererEnhedsNoegle,
  afledKeyId,
  wrapPrivat,
  unwrapPrivat,
  wrapKeyFraPRF,
  wrapKeyFraPassphrase,
  opretHukommelsesStore,
  gemCustody,
  hentCustody,
  x25519Delt,
} from '../mentem-inbox-enroll.js';

const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const eqBytes = (a, b) => a.length === b.length && bytesToHex(a) === bytesToHex(b);

let fejl = 0;
const check = (navn, ok, extra = '') => { console.log((ok ? '  ✅ ' : '  ❌ ') + navn + (ok ? '' : '  ' + extra)); if (!ok) fejl++; };
async function forventKast(navn, fn, forventetName) {
  try { await fn(); check(navn + ' (skulle kaste)', false, 'kastede ikke'); }
  catch (e) { check(navn, !forventetName || e.name === forventetName, `fik ${e.name}: ${e.message}`); }
}

console.log('\nklient-inbox Batch 1B - custody-kerne VERA\n');

// 1. Enheds-noeglegen (WebCrypto-primaer)
const dev = await genererEnhedsNoegle();
check('genererEnhedsNoegle: 32-byte privat', dev.priv instanceof Uint8Array && dev.priv.length === 32);
check('genererEnhedsNoegle: 32-byte public', dev.pub instanceof Uint8Array && dev.pub.length === 32);
check('public = X25519(priv, base) (byte-eksakt)', eqBytes(dev.pub, x25519Delt.getPublicKey(dev.priv)));
check('key_id = foerste 8 hex af SHA-256(pub)', dev.keyId === (await afledKeyId(dev.pub)) && /^[0-9a-f]{8}$/.test(dev.keyId));
check('device_id = uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(dev.deviceId));
check('x25519_pub = base64url af pub (ingen padding)', /^[A-Za-z0-9_-]+$/.test(dev.x25519_pub));

// 2. Fallback-sti (ren-JS) giver ogsaa gyldigt par
const devFb = await genererEnhedsNoegle({ tvingFallback: true });
check('fallback-gen: public matcher X25519(priv,base)', eqBytes(devFb.pub, x25519Delt.getPublicKey(devFb.priv)));

// 3. Wrap/unwrap roundtrip (PRF-tier)
const prfOutput = crypto.getRandomValues(new Uint8Array(32)); // enheds-lokal PRF-output (simuleret)
const wrapKeyPRF = await wrapKeyFraPRF(prfOutput);
const wrapped = await wrapPrivat(dev.priv, wrapKeyPRF);
check('wrap-container har nonce + ct (ingen klartekst-priv)', !!wrapped.nonce && !!wrapped.ct && !JSON.stringify(wrapped).includes(bytesToHex(dev.priv)));
const unwrapped = await unwrapPrivat(wrapped, wrapKeyPRF);
check('unwrap(wrap(priv)) === priv (PRF-tier)', eqBytes(unwrapped, dev.priv));

// 4. Forkert wrap-noegle -> AEAD afviser (kan ikke unwrappes)
const forkertKey = await wrapKeyFraPRF(crypto.getRandomValues(new Uint8Array(32)));
await forventKast('unwrap med forkert noegle afvises', () => unwrapPrivat(wrapped, forkertKey));

// 5. Passphrase-tier (deterministisk pr. (passphrase,salt))
const salt = crypto.getRandomValues(new Uint8Array(16));
const wkA = await wrapKeyFraPassphrase('viktor-laeser-koden-op', salt);
const wkB = await wrapKeyFraPassphrase('viktor-laeser-koden-op', salt);
check('wrapKeyFraPassphrase deterministisk (samme passphrase+salt)', eqBytes(wkA, wkB));
const wkC = await wrapKeyFraPassphrase('anden-passphrase', salt);
check('wrapKeyFraPassphrase varierer paa passphrase', !eqBytes(wkA, wkC));
const wrappedPass = await wrapPrivat(dev.priv, wkA);
check('unwrap(wrap(priv)) === priv (passphrase-tier)', eqBytes(await unwrapPrivat(wrappedPass, wkB), dev.priv));

// 6. IndexedDB-custody-roundtrip via injiceret store + klartekst-fitness
const store = opretHukommelsesStore();
const record = {
  deviceId: dev.deviceId, keyId: dev.keyId, x25519_pub: dev.x25519_pub,
  tier: 'prf', wrapped, createdAt: '2026-07-14T00:00:00Z',
};
await gemCustody(store, record);
const hentet = await hentCustody(store);
check('custody-roundtrip: samme device_id/key_id/pub', hentet && hentet.deviceId === dev.deviceId && hentet.keyId === dev.keyId && hentet.x25519_pub === dev.x25519_pub);
check('custody lagrer ALDRIG klartekst-privat (fitness)', hentet && !JSON.stringify(hentet).includes(bytesToHex(dev.priv)));
const genUnwrap = await unwrapPrivat(hentet.wrapped, wrapKeyPRF);
check('privat kan unwrappes tilbage fra store', eqBytes(genUnwrap, dev.priv));

// 7. Custody-ECDH-agreement: den custody-holdte privatnoegle KAN faerdiggoere den udgaaende konvolut-ECDH
//    (fundament for Fase 2, uden at bygge dekrypt/vis-traaden). eph<->device begge veje giver samme secret.
const ephPriv = x25519Delt.utils.randomPrivateKey();
const ephPub = x25519Delt.getPublicKey(ephPriv);
const sAfsender = x25519Delt.getSharedSecret(ephPriv, dev.pub);          // MJ krypterer TIL device-pub
const sModtager = x25519Delt.getSharedSecret(genUnwrap, ephPub);         // klient afleder via unwrappet priv
check('X25519 ECDH-agreement (afsender == modtager)', eqBytes(sAfsender, sModtager));

console.log(`\n  ${fejl === 0 ? 'ALLE GROENNE' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
