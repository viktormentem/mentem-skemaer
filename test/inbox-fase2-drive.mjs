// VERA (Fase 2, integration-drive) - klient-inbox lag 1 / Fase 2 tovejs E2E mod LOKAL worker.
// Beviser hele den udgaaende skinne end-to-end mod en aegte `wrangler dev`:
//   enroll (Batch 1B) -> authenticate (session) -> BEHANDLER seeder /outbox (mentemEncrypt til
//   enheds-pubkey + POST /outbox som MJ-service-token) -> KLIENT GET /inbox (session) -> dekrypter
//   -> POST /inbox/ack -> GET /inbox igen (tomt). Tilstandsmaskine queued -> hentet -> acked bevist.
//
// Startes af test/run-inbox-fase2-vera.sh (spinner worker + migrerer D1). NUL rigtig klient-data.
// RED-baseline uden worker: /health -> ECONNREFUSED.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { mentemEncrypt } from '../mentem-skema-core.js';
import { genererEnhedsNoegle, dekrypterKonvolut } from '../mentem-inbox-enroll.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:5173';
const WORKER_DIR = process.env.WORKER_DIR
  || path.resolve(new URL('.', import.meta.url).pathname, '../../PsykologInvitation/ingest-worker');

// 🔴 UMAALT FREM FOR ROED (15/8), samme grund som i inbox-enroll-vera.mjs:
// `webauthn-authenticator.mjs` bor paa den ULANDEDE gren
// `feat/klient-inbox-fase2-swift-udgaaende-2026-07-14` (13/7) og findes ikke i kanonisk
// `ingest-worker/test/`. Uden kontrollen kaster importen »Cannot find module«, og harnessen
// laeses som DOED. Den er ikke i stykker, den er FOR TIDLIG.
// 🔵 En roed dom der betyder »ikke relevant endnu« er lige saa misvisende som et falsk groent.
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
if (!fs.existsSync(keyFile)) { console.error('Mangler worker-synth-noegle:', keyFile); process.exit(2); }
const synth = JSON.parse(fs.readFileSync(keyFile));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });

// SERVICE_TOKEN (MJ-side auth til /outbox) laeses fra worker-lanens .dev.vars (som .synthetic-key.json).
function laesServiceToken() {
  const p = path.join(WORKER_DIR, '.dev.vars');
  const m = fs.readFileSync(p, 'utf8').match(/^SERVICE_TOKEN=(.*)$/m);
  if (!m) { console.error('SERVICE_TOKEN mangler i', p); process.exit(2); }
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const SERVICE_TOKEN = laesServiceToken();

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function mintToken({ pseudonymID, exp, scope }) {
  const scopeB64 = b64url(JSON.stringify(scope));
  const msg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
  return `${msg}.${b64url(crypto.sign(null, Buffer.from(msg), tokenPriv))}`;
}
async function call(method, p, { body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data; try { data = await r.json(); } catch { data = await r.text(); }
  return { status: r.status, data };
}

let fejl = 0;
const check = (ok, navn, extra = '') => { console.log((ok ? '  ✅ ' : '  ❌ ') + navn + (ok ? '' : '  ' + extra)); if (!ok) fejl++; };

const pseudonymID = 'SYN-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const enrollToken = mintToken({ pseudonymID, exp, scope: { t: 'individ', k: 'enroll' } });

console.log(`\nklient-inbox Fase 2 - tovejs integration-drive VERA @ ${BASE}\npseudonym=${pseudonymID}\n`);

let r = await call('GET', '/health');
check(r.status === 200 && r.data && r.data.ok, 'GET /health -> 200 ok');

// 1. Enroll (Batch 1B): registrér enhedens RIGTIGE pubkey.
const dev = await genererEnhedsNoegle();
const devicePubKey = { x25519_pub: dev.x25519_pub, key_id: dev.keyId, device_id: dev.deviceId };
const authr = new SoftwareAuthenticator();
r = await call('POST', '/webauthn/register/options', { body: { token: enrollToken } });
const attestationResponse = authr.makeRegistration({ rpID: RP_ID, challenge: r.data.options.challenge, origin: RP_ORIGIN });
r = await call('POST', '/webauthn/register/verify', { body: { token: enrollToken, attestationResponse, devicePubKey } });
check(r.status === 200 && r.data.verified === true, 'enroll: register/verify -> verified (device-pub registreret)');

// 2. Authenticate -> session-bearer (klient-laese-auth).
r = await call('POST', '/webauthn/authenticate/options', { body: { pseudonym_id: pseudonymID } });
const assertion = authr.makeAssertion({ rpID: RP_ID, challenge: r.data.options.challenge, origin: RP_ORIGIN, userHandle: pseudonymID });
r = await call('POST', '/webauthn/authenticate/verify', { body: { pseudonym_id: pseudonymID, assertionResponse: assertion } });
check(r.status === 200 && !!r.data.session, 'authenticate -> session-bearer udstedt');
const session = r.data.session;
const bearer = { authorization: `Bearer ${session}` };

// 3. BEHANDLER-SIDEN (MJ) krypterer besked til enheds-pubkey + pusher til /outbox (service-token).
const besked_uuid = crypto.randomUUID();
const besked = { tekst: 'Godt arbejde i sidste uge. Husk oevelsen til torsdag. AEOEAA: æøå.', traad_id: 'traad-1', besked_uuid };
const konvolut = await mentemEncrypt(dev.x25519_pub, besked);
r = await call('POST', '/outbox', {
  headers: { 'X-Mentem-Service-Token': SERVICE_TOKEN },
  body: { pseudonym_id: pseudonymID, besked_uuid, ciphertext: JSON.stringify(konvolut), envelope_version: 1 },
});
check(r.status === 200 && r.data.status === 'queued', 'behandler: POST /outbox -> queued (service-token)', JSON.stringify(r.data));

// 3b. FITNESS: /outbox uden service-token -> 401 (kun MJ maa pushe).
r = await call('POST', '/outbox', { body: { pseudonym_id: pseudonymID, besked_uuid: 'x', ciphertext: 'x' } });
check(r.status === 401, 'FITNESS: /outbox uden service-token -> 401');

// 4. KLIENT henter /inbox (session) -> dekrypterer -> laeser klarteksten.
r = await call('GET', '/inbox', { headers: bearer });
check(r.status === 200 && r.data.count === 1, 'klient: GET /inbox -> 1 besked (hentet-flip)', JSON.stringify(r.data).slice(0, 80));
const raw = r.data.beskeder[0];
check(raw.beskedUUID === besked_uuid, 'inbox-besked har korrekt besked_uuid');
const ud = await dekrypterKonvolut(JSON.parse(raw.ciphertext), dev.priv);
check(JSON.stringify(ud) === JSON.stringify(besked), 'klient dekrypterer /inbox-konvolut -> original besked (E2E)', JSON.stringify(ud).slice(0, 80));

// 4b. FITNESS: /inbox uden session-bearer -> 401.
r = await call('GET', '/inbox');
check(r.status === 401, 'FITNESS: /inbox uden session-bearer -> 401');

// 5. Ack -> acked; GET /inbox igen -> tomt (tilstandsmaskine hentet -> acked bevist).
r = await call('POST', '/inbox/ack', { headers: bearer, body: { besked_uuid } });
check(r.status === 200 && r.data.acked === true, 'klient: POST /inbox/ack -> acked');
r = await call('GET', '/inbox', { headers: bearer });
check(r.status === 200 && r.data.count === 0, 'GET /inbox efter ack -> tomt (acked filtreret)');

console.log(`\n  ${fejl === 0 ? 'ALLE GROENNE' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
