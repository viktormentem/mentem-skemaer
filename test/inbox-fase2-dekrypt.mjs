// VERA (Fase 2, custody-level) - klient-inbox lag 1 / Fase 2 udgaaende-konvolut-DEKRYPT.
// Beviser at klient-halvdelen kan DEKRYPTERE den udgaaende konvolut (behandler -> klient) MED
// GENBRUG af det eksisterende, production-beviste Export-v1-format: den RIGTIGE mentemEncrypt
// (mentem-skema-core.js, samme funktion klient->ingest bruger) krypterer til enhedens registrerede
// X25519-pubkey, og dekrypterKonvolut() henter klarteksten via den custody-lagrede enheds-privat.
//
// INGEN worker, INGEN prod, INGEN klient-data. Ren node-roundtrip (kan koeres standalone).
// RED-baseline: dekrypterKonvolut findes ikke -> import giver undefined -> foerste check kaster.
import crypto from 'node:crypto';
import { mentemEncrypt } from '../mentem-skema-core.js';
import {
  genererEnhedsNoegle, wrapPrivat, unwrapPrivat, wrapKeyFraPRF,
  opretHukommelsesStore, gemCustody, hentCustody, x25519Delt,
  dekrypterKonvolut, KONVOLUT_INFO,
} from '../mentem-inbox-enroll.js';

let fejl = 0;
const check = (ok, navn, extra = '') => { console.log((ok ? '  ✅ ' : '  ❌ ') + navn + (ok ? '' : '  ' + extra)); if (!ok) fejl++; };
const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

console.log('\nklient-inbox Fase 2 - udgaaende-konvolut DEKRYPT VERA (custody-level, ingen worker)\n');

// Format-kontrakt: dekryptet bruger PRAECIS mentemEncrypts info-streng (ikke et nyt format).
check(KONVOLUT_INFO === 'TherapyCopilot-E2E-Export-v1', 'KONVOLUT_INFO == Export-v1 (genbrug, ikke nyt format)', KONVOLUT_INFO);

// 1. Klienten har sin custody-enheds-noegle (samme som Batch 1B enroll registrerede).
const dev = await genererEnhedsNoegle();
const besked = { tekst: 'Hej, her er en besked fra din psykolog. AEOEAA: æøå.', traad_id: 'traad-1', besked_uuid: crypto.randomUUID() };

// 2. BEHANDLER-SIDEN krypterer med den RIGTIGE mentemEncrypt til enhedens registrerede pubkey
//    (spejler Swift E2EKryptering.krypter(modtagerPubkey:) - samme Export-v1-format).
const konvolut = await mentemEncrypt(dev.x25519_pub, besked);
check(konvolut.formatIdentifier === 'therapy-copilot-encrypted-export', 'konvolut = Export-v1 (mentemEncrypt-produceret)');

// 3. KLIENTEN dekrypterer med sin enheds-privat -> faar klarteksten tilbage.
const ud = await dekrypterKonvolut(konvolut, dev.priv);
check(JSON.stringify(ud) === JSON.stringify(besked), 'dekrypterKonvolut(konvolut, priv) == original besked (roundtrip)', JSON.stringify(ud));

// 4. CUSTODY-STI: den privat der er WRAPPET + lagret + unwrappet (som paa enheden) dekrypterer ogsaa.
const wrapKey = await wrapKeyFraPRF(crypto.getRandomValues(new Uint8Array(32)));
const wrapped = await wrapPrivat(dev.priv, wrapKey);
const store = opretHukommelsesStore();
await gemCustody(store, { deviceId: dev.deviceId, keyId: dev.keyId, x25519_pub: dev.x25519_pub, tier: 'prf', wrapped, createdAt: new Date().toISOString() });
const unwrapped = await unwrapPrivat((await hentCustody(store)).wrapped, wrapKey);
const udCustody = await dekrypterKonvolut(konvolut, unwrapped);
check(JSON.stringify(udCustody) === JSON.stringify(besked), 'custody-lagret (wrap->store->unwrap) privat dekrypterer korrekt');

// 5. FITNESS (ratchet): en konvolut krypteret til enhed A kan ALDRIG dekrypteres af enhed B's privat
//    (AEAD-auth fejler). "Klienten kan aldrig laese en besked krypteret til en fremmed enheds-noegle."
const dev2 = await genererEnhedsNoegle();
let kastede = false;
try { await dekrypterKonvolut(konvolut, dev2.priv); } catch { kastede = true; }
check(kastede, 'FITNESS: forkert enheds-privat -> AEAD afviser (kaster)');

// 6. FITNESS: pillet ciphertext (én byte) -> AEAD afviser.
const pillet = { ...konvolut, encryptedData: Buffer.from((() => { const b = Buffer.from(konvolut.encryptedData, 'base64'); b[0] ^= 0x01; return b; })()).toString('base64') };
let kastede2 = false;
try { await dekrypterKonvolut(pillet, dev.priv); } catch { kastede2 = true; }
check(kastede2, 'FITNESS: pillet ciphertext -> AEAD afviser (integritet)');

// 7. FALLBACK-STI: mentemEncrypt via ren-JS X25519 (aeldre-browser-sti) giver SAMME format -> dekrypteres.
const konvFallback = await mentemEncrypt(dev.x25519_pub, besked, undefined, { tvingFallback: true });
const udFallback = await dekrypterKonvolut(konvFallback, dev.priv);
check(JSON.stringify(udFallback) === JSON.stringify(besked), 'fallback-krypteret konvolut dekrypteres (begge X25519-stier = samme format)');

console.log(`\n  ${fejl === 0 ? 'ALLE GROENNE' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
