// VERA (enroll-drive) - klient-inbox lag 1 / Batch 1B.
// Driver klient-halvdelen mod en LOKAL worker (`wrangler dev`): den RIGTIGE enheds-noegle fra
// mentem-inbox-enroll.js registreres via WebAuthn register/verify, credentialen bevises brugbar
// (authenticate -> session), og custody-roundtrippen bekraeftes E2E: det workeren gemte som
// device-pubkey == den pub som den unwrappede custody-privat afleder.
//
// FORUDSAETNING: `wrangler dev` koerer paa BASE (default 127.0.0.1:8787) med .dev.vars der matcher
// RP_ID=localhost / RP_ORIGIN=http://localhost:5173 + INGEST_TOKEN_PUBKEY = worker-synth-noeglen.
// Startes af test/run-inbox-enroll-vera.sh. NUL rigtig klient-data.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  genererEnhedsNoegle, wrapPrivat, unwrapPrivat, wrapKeyFraPRF, afledKeyId,
  opretHukommelsesStore, gemCustody, hentCustody, x25519Delt,
} from '../mentem-inbox-enroll.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:5173';
const WORKER_DIR = process.env.WORKER_DIR
  || path.resolve(new URL('.', import.meta.url).pathname, '../../PsykologInvitation/ingest-worker');

// Worker-artefakter (modpart): software-authenticator + syntetisk Ed25519-token-noegle.
//
// 🔴 UMAALT FREM FOR ROED (15/8). `webauthn-authenticator.mjs` ligger paa den ULANDEDE gren
// `feat/klient-inbox-fase2-swift-udgaaende-2026-07-14` (committet 13/7) og findes IKKE i
// kanonisk `ingest-worker/test/`. Uden denne kontrol kaster importen »Cannot find module«,
// og en folketaelling over harnesserne klassificerer den som DOED , altsaa som noget der er
// i stykker. Den er ikke i stykker, den er FOR TIDLIG: den proever Fase 2, som ikke er
// landet endnu.
// 🔵 Samme disciplin som husets »exit 0 maa aldrig daekke over jeg kan ikke«, spejlvendt:
// **en roed dom der betyder »ikke relevant endnu« er lige saa misvisende som et falsk groent.**
// rc 3 = UMAALT, med aarsagen skrevet ud, saa den naeste ikke skal gentage opklaringen.
const _authFil = path.join(WORKER_DIR, 'test/webauthn-authenticator.mjs');
if (!fs.existsSync(_authFil)) {
  console.error('UMAALT: ' + _authFil + ' findes ikke.');
  console.error('  Den bor paa den ULANDEDE gren feat/klient-inbox-fase2-swift-udgaaende-2026-07-14.');
  console.error('  Denne harness proever Fase 2 og kan foerst koere naar den gren er landet.');
  console.error('  Ingen dom afgivet. Saet WORKER_DIR= mod et trae der har filen for at koere den.');
  process.exit(3);
}
const { SoftwareAuthenticator } = await import(_authFil);
const keyFile = path.join(WORKER_DIR, 'test/.synthetic-key.json');
if (!fs.existsSync(keyFile)) { console.error('Mangler worker-synth-noegle:', keyFile, '- koer `npm run gen-key` i ingest-worker.'); process.exit(2); }
const synth = JSON.parse(fs.readFileSync(keyFile));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const eqBytes = (a, b) => a.length === b.length && bytesToHex(a) === bytesToHex(b);

// Mint et Ed25519 enrollment-token i worker-kontraktens format (v1.<pseudonym>.<exp>.<scopeB64>.<sig>).
function mintToken({ pseudonymID, exp, scope }) {
  const scopeB64 = b64url(JSON.stringify(scope));
  const msg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
  const sig = crypto.sign(null, Buffer.from(msg), tokenPriv);
  return `${msg}.${b64url(sig)}`;
}
async function call(method, p, { body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data; try { data = await r.json(); } catch { data = await r.text(); }
  return { status: r.status, data };
}

let fejl = 0;
const check = (ok, navn, extra = '') => { console.log((ok ? '  ✅ ' : '  ❌ ') + navn + (ok ? '' : '  ' + extra)); if (!ok) fejl++; };

const pseudonymID = 'SYN-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const enrollToken = mintToken({ pseudonymID, exp, scope: { t: 'individ', k: 'enroll' } });

console.log(`\nklient-inbox Batch 1B - enroll-drive VERA @ ${BASE}  (rpID=${RP_ID} origin=${RP_ORIGIN})`);
console.log(`pseudonym=${pseudonymID}\n`);

// 0. worker oppe
let r = await call('GET', '/health');
check(r.status === 200 && r.data && r.data.ok, 'GET /health -> 200 ok', JSON.stringify(r.data));

// 1. Klienten genererer sin RIGTIGE enheds-noegle (custody-repraesentation) - IKKE dummy-bytes.
const dev = await genererEnhedsNoegle();
check(dev.priv.length === 32 && dev.pub.length === 32, 'enheds-noegle genereret (32B priv/pub)');
check(dev.keyId === (await afledKeyId(dev.pub)), 'key_id afledt af pub');
const devicePubKey = { x25519_pub: dev.x25519_pub, key_id: dev.keyId, device_id: dev.deviceId };
const auth = new SoftwareAuthenticator();

// 2. register/options (enroll-token) -> challenge (pseudonymt user)
r = await call('POST', '/webauthn/register/options', { body: { token: enrollToken } });
check(r.status === 200 && r.data.options && r.data.options.challenge, 'register/options -> challenge', JSON.stringify(r.data).slice(0, 120));
check(r.data.options.user && r.data.options.user.name === pseudonymID, 'register-options user = pseudonym (ingen identitet)');
const regChallenge = r.data.options.challenge;

// 3. register/verify med RIGTIG devicePubKey (passkey via software-authenticator)
const attestationResponse = auth.makeRegistration({ rpID: RP_ID, challenge: regChallenge, origin: RP_ORIGIN });
r = await call('POST', '/webauthn/register/verify', { body: { token: enrollToken, attestationResponse, devicePubKey } });
check(r.status === 200 && r.data.verified === true, 'register/verify -> verified:true (rigtig device-pub registreret)', JSON.stringify(r.data));
const credentialId = r.data.credentialId;

// 4. CUSTODY-INVARIANT (worker-side): register/verify UDEN devicePubKey afvises -> klienten SKAL
//    registrere en enheds-pubkey (per-enheds custody kan ikke springes over).
const auth2 = new SoftwareAuthenticator();
let r2 = await call('POST', '/webauthn/register/options', { body: { token: enrollToken } });
const att2 = auth2.makeRegistration({ rpID: RP_ID, challenge: r2.data.options.challenge, origin: RP_ORIGIN });
r = await call('POST', '/webauthn/register/verify', { body: { token: enrollToken, attestationResponse: att2 } });
check(r.status === 400 && r.data.err === 'missing_devicePubKey', 'register/verify uden devicePubKey -> 400 missing_devicePubKey', JSON.stringify(r.data));

// 5. Custody-roundtrip: wrap (PRF-tier) -> IndexedDB-store -> unwrap. Den unwrappede privat afleder
//    PRAECIS den pub klienten registrerede paa workeren (dvs. workeren holder den rette PUBLIC-halvdel).
const prf = crypto.getRandomValues(new Uint8Array(32)); // enheds-lokal PRF-output (simuleret)
const wrapKey = await wrapKeyFraPRF(prf);
const wrapped = await wrapPrivat(dev.priv, wrapKey);
const store = opretHukommelsesStore();
await gemCustody(store, { deviceId: dev.deviceId, keyId: dev.keyId, x25519_pub: dev.x25519_pub, tier: 'prf', wrapped, createdAt: new Date(exp * 1000).toISOString() });
const hentet = await hentCustody(store);
const unwrapped = await unwrapPrivat(hentet.wrapped, wrapKey);
const afledtPub = x25519Delt.getPublicKey(unwrapped);
const afledtPubB64 = b64url(afledtPub);
check(afledtPubB64 === devicePubKey.x25519_pub, 'custody: unwrappet privat afleder den REGISTREREDE device-pub', `${afledtPubB64} vs ${devicePubKey.x25519_pub}`);
check(!JSON.stringify(hentet).includes(bytesToHex(dev.priv)), 'custody lagrer ALDRIG klartekst-privat (fitness)');

// 6. Credentialen er brugbar: authenticate/options -> assertion -> session (passkey-login virker)
r = await call('POST', '/webauthn/authenticate/options', { body: { pseudonym_id: pseudonymID } });
check(r.status === 200 && (r.data.options.allowCredentials || []).some((c) => c.id === credentialId), 'authenticate/options lister klientens credential');
const assertion = auth.makeAssertion({ rpID: RP_ID, challenge: r.data.options.challenge, origin: RP_ORIGIN, userHandle: pseudonymID });
r = await call('POST', '/webauthn/authenticate/verify', { body: { pseudonym_id: pseudonymID, assertionResponse: assertion } });
check(r.status === 200 && r.data.verified === true && !!r.data.session, 'authenticate/verify -> session udstedt (credential brugbar)', JSON.stringify(r.data).slice(0, 100));

console.log(`\n  ${fejl === 0 ? 'ALLE GROENNE' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
