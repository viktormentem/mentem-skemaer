// nudge-eval-kontrakt.mjs - nudgeEval flyder additivt som meta til payload.
// Koer: node test/nudge-eval-kontrakt.mjs
import { buildPayloadCSD, NUDGE_EVAL_SVAR } from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok) { if (ok) console.log(`  ✓ ${navn}`); else { fejl++; console.error(`  ✗ ${navn}`); } }

// NB: buildPayloadCSD returnerer den envelope-wrappede konvolut (objekt, ikke
// JSON-streng) - flade CSD-felter bor under `.data` (buildIngestKonvolut,
// samme moenster som test/nudge-payload-kontrakt.mjs og test/selftest.mjs).
// Justeret her (brief antog en flad JSON.parse-retur); assertions/entries uaendrede.
const evalSvar = [{ vedEntry: 7, svar: 'Både og', fritekst: '', date: '2026-07-29' }];
const p = buildPayloadCSD([], { nudgeEval: evalSvar }).data;
check('nudgeEval i payload', Array.isArray(p.nudgeEval) && p.nudgeEval[0].vedEntry === 7);
const p2 = buildPayloadCSD([], {}).data;
check('udeladt -> null (additivt)', p2.nudgeEval === null);
check('4 laaste svarmuligheder', Array.isArray(NUDGE_EVAL_SVAR) && NUDGE_EVAL_SVAR.length === 4
  && NUDGE_EVAL_SVAR.includes('De forstyrrer mig'));
process.exit(fejl ? 1 : 0);
