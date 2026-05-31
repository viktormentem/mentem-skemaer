// encrypt-fixture.mjs — round-trip-harness for Swift StaticSiteCryptoRoundTripTests.
//
// Krypterer en repræsentativ MCT-skema-payload (alle 7 skemaer) mod en
// modtager-X25519-public-key og printer KrypteretEksportContainer-JSON til stdout.
// Swift-testen decoder den via Mentems PRODUKTIONS-E2EKryptering.dekrypter().
//
// Brug:  node test/encrypt-fixture.mjs <recipientPubKeyBase64> [--break-tag]
//   --break-tag  = flip én byte i GCM-tag'et (negativ teeth-test: beviser at
//                  round-trip-testen fanger korruption/inkompatibilitet —
//                  AES-GCM auth-fail → dekrypter SKAL afvise blobben).

import { buildPayload, mentemEncrypt } from '../mentem-skema-core.js';

const pub = process.argv[2];
if (!pub) { console.error('mangler pubkey-arg'); process.exit(2); }
const breakTag = process.argv.includes('--break-tag');

const answers = {
  cas:   { 0: 80, 1: 70, 2: 60, 3: 50 },
  mcb:   { 0: 90, 1: 85, 2: 40, 3: 75, 4: 60 },
  gad7:  { 0: 1, 1: 2, 2: 1, 3: 0, 4: 2, 5: 1, 6: 1 },
  phq9:  { 0: 2, 1: 1, 2: 2, 3: 1, 4: 0, 5: 1, 6: 2, 7: 0, 8: 0 },
  who5:  { 0: 3, 1: 4, 2: 2, 3: 3, 4: 4 },
  wsas:  { 0: 5, 1: 3, 2: 4, 3: 2, 4: 6 },
  waisr: { 0: 5, 1: 4, 2: 6, 3: 5, 4: 5, 5: 4, 6: 6, 7: 5, 8: 4, 9: 6, 10: 5, 11: 5 },
};

const payload = buildPayload(answers, { name: 'Round-trip Klient', sessionNumber: 4 });
const container = await mentemEncrypt(pub, payload);

if (breakTag) {
  // Flip byte 0 i tag'et → AES-GCM authentication-fail ved dekryptering.
  const raw = Uint8Array.from(Buffer.from(container.tag, 'base64'));
  raw[0] = raw[0] ^ 0xff;
  container.tag = Buffer.from(raw).toString('base64');
}

process.stdout.write(JSON.stringify(container));
