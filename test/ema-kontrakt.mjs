// KONTRAKT: EMA-skemaet, og de tre steder der skal vaere enige om at det findes.
//
// HVORFOR DEN FINDES (16/8): den dyreste fejl paa denne akse er maalt og kostede en
// klient sine data. 26/7 sendte siden `soevn-screening`, workeren svarede 403, fordi
// skemaet aldrig kom paa dens allowlist. **Tre steder var enige om at skemaet fandtes,
// og det fjerde sagde nej**, og ingen af dem raabte foer en rigtig aflevering gik tabt.
//
// EMA er nyt i dag og har praecis samme tre-steders-form:
//   1. `SKEMAER.ema` i mentem-skema-core.js   (siden kan vise det)
//   2. `ALLOWED_SCHEMAS` i ingest-worker      (workeren tager imod det)
//   3. `/ema/naeste` i ingest-worker          (kadencen kan svare)
// Denne proeve maaler at alle tre findes, saa fejlen ikke kan gentages i tavshed.
//
// 🔵 Den maaler ogsaa FORMEN paa skemaet, og det er ikke pedanteri: to items er en
// dataminimerings-beslutning skrevet ind i art. 30-aktivitet 13. Vokser den til fire
// uden at fortegnelsen foelger med, er registret usandt. Proeven er det eneste sted
// den beslutning kan haandhaeves mekanisk.

import { readFileSync } from 'node:fs';
import { SKEMAER } from '../mentem-skema-core.js';

let fejl = 0;
const ok = (b, t, ekstra = '') => { console.log(b ? '  OK ' : '  XX ', t, ekstra); if (!b) fejl++; };

const WORKER = new URL('../../PsykologInvitation/ingest-worker/src/index.js', import.meta.url);
let kilde = '';
try { kilde = readFileSync(WORKER, 'utf8'); } catch { /* maales nedenfor */ }

// 🔴 POS-KTRL FOERST. Kan vi ikke laese workerens kilde, maa proeven ikke frikende de
// tre led ved at finde nul af hvert. Et nul fra en fil der ikke blev laest, er ikke et nul.
if (!kilde || !kilde.includes('ALLOWED_SCHEMAS')) {
  console.error('UMAALT: kunne ikke laese ingest-worker/src/index.js (eller den mangler');
  console.error('  ALLOWED_SCHEMAS). Ingen dom afgivet over de tre led.');
  process.exit(3);
}

console.log('\nEMA-kontrakt: siden, workeren og kadencen\n');

// 1. Siden
const e = SKEMAER.ema;
ok(!!e, 'SKEMAER.ema findes (siden kan vise skemaet)');
ok(e?.id === 'ema', 'id er "ema"', e?.id);
ok(e?.kind === 'vas', 'kind er "vas" (0-100-skalaer, som cas og mcb)', e?.kind);
ok(Array.isArray(e?.items) && e.items.length === 2,
   'PRAECIS 2 items (dataminimering, art. 30 aktivitet 13)', `fandt ${e?.items?.length}`);
const noegler = (e?.items || []).map(i => i.key).sort().join(',');
ok(noegler === 'uncontrollability,worry',
   'noeglerne er genbrugt fra cas/mcb, saa serierne kan sammenlignes', noegler);
ok(typeof e?.instruction === 'string' && /siden sidste gang/i.test(e.instruction),
   'instruktionen er MOMENTAN, ikke uge-forankret (ellers er den ikke EMA)');

// 2. Workeren tager imod
// 🔴 BLOKKEN SKAERES PAA SIN EGEN SLUTNING, ikke paa et tal. Foerste udgave tog 800 tegn
// efter `ALLOWED_SCHEMAS` og meldte ROEDT paa en allowlist der var i orden: `'ema'` staar
// paa tegn 1013, bag en kommentarblok. **Et vindue valgt i haanden maaler vinduet, ikke
// listen**, og en falsk roed paa netop denne akse ville laere den naeste at ignorere den.
const _i = kilde.indexOf('ALLOWED_SCHEMAS');
const _blok = kilde.slice(_i, kilde.indexOf(']);', _i));
ok(/'ema'/.test(_blok),
   "'ema' staar paa ALLOWED_SCHEMAS (ellers 403, som soevn-screening 26/7)");
ok(/'soevndagbog'/.test(_blok), 'POS-KTRL: blokken indeholder en noegle vi VED staar der');

// 3. Kadencen kan svare
ok(kilde.includes("'/ema/naeste'"), 'ruten /ema/naeste er wired i workeren');
ok(/EMA_PR_DOEGN\s*=\s*\d+/.test(kilde), 'kvoten er en navngiven konstant');
ok(/EMA_MIN_AFSTAND_MIN\s*=\s*\d+/.test(kilde), 'minimum-afstanden er en navngiven konstant');

// NEG-KTRL: naalen maa ikke frikende hvad som helst.
ok(!/'zzqxq-findes-ikke'/.test(_blok), 'NEG-KTRL: en opdigtet noegle staar IKKE paa allowlisten');

console.log(`\n  ${fejl === 0 ? 'EMA-KONTRAKT GROEN' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
