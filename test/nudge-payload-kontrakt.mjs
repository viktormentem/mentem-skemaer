// nudge-payload-kontrakt.mjs - nudgeKort flyder additivt gennem buildPayloadCSD.
// Koer: node test/nudge-payload-kontrakt.mjs
import { buildPayloadCSD } from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok) { if (ok) console.log(`  ✓ ${navn}`); else { fejl++; console.error(`  ✗ ${navn}`); } }

const entries = [
  { date: '2026-07-22', bedtime: '23:30', outOfBed: '06:10',
    nudgeKort: { id: 'C', tekstVersion: 'v1' } },
  { date: '2026-07-23', bedtime: '23:30', outOfBed: '07:10', nudgeKort: null },
  { date: '2026-07-24', bedtime: '23:30', outOfBed: '06:10' },   // aeldre entry uden feltet
];
// NB: buildPayloadCSD returnerer den envelope-wrappede konvolut (objekt, ikke
// JSON-streng) - fladt sleepDiary bor under `.data` (buildIngestKonvolut,
// samme moenster som test/selftest.mjs). Justeret her (brief antog en flad
// JSON-streng-retur og top-level `.sleepDiary`; det stemmer ikke med den
// eksisterende envelope-wrap-kontrakt) - assertions/entries uaendrede.
const p = buildPayloadCSD(entries, {}).data;
check('post 1 baerer nudgeKort', p.sleepDiary[0].nudgeKort?.id === 'C'
  && p.sleepDiary[0].nudgeKort?.tekstVersion === 'v1');
check('post 2 baerer eksplicit null', p.sleepDiary[1].nudgeKort === null);
check('post 3 udelader feltet (additivt)', !('nudgeKort' in p.sleepDiary[2]));
check('CSD-felter uroerte', p.sleepDiary[0].bedtime === '23:30');
process.exit(fejl ? 1 : 0);
