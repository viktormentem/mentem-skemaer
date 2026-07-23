// nudge-kort-motor.mjs - Feature B regel-motor: triggere, prioritet, manglende felter.
// Koer: node test/nudge-kort-motor.mjs
import { vaelgNudgeKort, NUDGE_KORT_TEKST, NUDGE_KORT_VERSION } from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) console.log(`  ✓ ${navn}`);
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

const CTX = { tibOrd: 390, wakeOrd: '06:00', tn: null, nudgeFra: false };
// vinduesstart = 06:00 minus 390 min = 23:30.
const HOLDT = { bedtime: '23:30', outOfBed: '06:10', sleepLatencyMin: 10,
                awakeningsMin: 5, quality: 'Nogenlunde', substans: null };

console.log('Kort A (oppe for sent):');
check('A fyrer: TIB +70, oppe +60', vaelgNudgeKort(
  { ...HOLDT, bedtime: '23:30', outOfBed: '07:10' }, CTX)?.id === 'A');
check('A vinder over B naar begge matcher', vaelgNudgeKort(
  { ...HOLDT, bedtime: '22:30', outOfBed: '07:10' }, CTX)?.id === 'A');

console.log('Kort B (i seng for tidligt):');
check('B fyrer: i seng 22:30, oppe til tiden 06:10 -> TIB 460 > 420',
  vaelgNudgeKort({ ...HOLDT, bedtime: '22:30' }, CTX)?.id === 'B');

console.log('Kort C (ros):');
check('C fyrer ved holdt vindue', vaelgNudgeKort(HOLDT, CTX)?.id === 'C');
check('C kraever begge graenser: oppe +45 men TIB inden for -> intet glidningskort, C fyrer IKKE (outOfBed-graense)',
  vaelgNudgeKort({ ...HOLDT, bedtime: '00:15', outOfBed: '06:55' }, CTX)?.id !== 'C');

console.log('Kort D (laenge vaagen):');
check('D fyrer: vaagen 60+ og vindue holdt', vaelgNudgeKort(
  { ...HOLDT, sleepLatencyMin: 40, awakeningsMin: 25 }, CTX)?.id === 'D');
check('D over C', vaelgNudgeKort(
  { ...HOLDT, sleepLatencyMin: 40, awakeningsMin: 25 }, CTX)?.id === 'D');

console.log('Kort E (uge 1):');
check('E fyrer: tn=0 + Daarlig, vindue holdt', vaelgNudgeKort(
  { ...HOLDT, quality: 'Dårlig' }, { ...CTX, tn: 0 })?.id === 'E');
check('E fyrer ved Meget daarlig', vaelgNudgeKort(
  { ...HOLDT, quality: 'Meget dårlig' }, { ...CTX, tn: 0 })?.id === 'E');
check('glidning slaar E', vaelgNudgeKort(
  { ...HOLDT, quality: 'Dårlig', outOfBed: '07:10' }, { ...CTX, tn: 0 })?.id === 'A');
check('E fyrer IKKE uden tn=0', vaelgNudgeKort(
  { ...HOLDT, quality: 'Dårlig' }, CTX)?.id !== 'E');

console.log('Kort F (alkohol):');
check('F fyrer: alkohol rapporteret, vindue holdt', vaelgNudgeKort(
  { ...HOLDT, substans: { alkohol: [{ hvad: 'vin' }] } }, CTX)?.id === 'F');
check('E slaar F', vaelgNudgeKort(
  { ...HOLDT, quality: 'Dårlig', substans: { alkohol: [{ hvad: 'vin' }] } },
  { ...CTX, tn: 0 })?.id === 'E');
check('F slaar D', vaelgNudgeKort(
  { ...HOLDT, sleepLatencyMin: 40, awakeningsMin: 25, substans: { alkohol: [{}] } }, CTX)?.id === 'F');
check('F fyrer IKKE ved intet=true', vaelgNudgeKort(
  { ...HOLDT, substans: { intet: true } }, CTX)?.id !== 'F');

console.log('Midnats-kryds:');
check('TIB henover midnat regnes rigtigt (23:30 -> 06:10 = 400 min)',
  vaelgNudgeKort(HOLDT, CTX)?.id === 'C');
check('i seng efter midnat (00:30 -> 06:00 = 330 min, holdt)',
  vaelgNudgeKort({ ...HOLDT, bedtime: '00:30', outOfBed: '06:00' }, CTX)?.id === 'C');

console.log('Manglende felter / fra-slag:');
check('null uden bedtime', vaelgNudgeKort({ ...HOLDT, bedtime: null }, CTX) === null);
check('null uden outOfBed', vaelgNudgeKort({ ...HOLDT, outOfBed: null }, CTX) === null);
check('null uden tibOrd (ikke SRT-mode)', vaelgNudgeKort(HOLDT, { ...CTX, tibOrd: null }) === null);
check('null ved nudgeFra', vaelgNudgeKort(HOLDT, { ...CTX, nudgeFra: true }) === null);
check('D kraever begge minut-felter: latency alene 40 -> ikke D',
  vaelgNudgeKort({ ...HOLDT, sleepLatencyMin: 40, awakeningsMin: null }, CTX)?.id !== 'D');

console.log('Tekster og version:');
check('version v1', NUDGE_KORT_VERSION === 'v1');
for (const id of ['A', 'B', 'C', 'D', 'E', 'F'])
  check(`tekst ${id} findes og er em-dash-fri`,
    !!NUDGE_KORT_TEKST[id] && !NUDGE_KORT_TEKST[id].tekst.includes('—')
    && !NUDGE_KORT_TEKST[id].titel.includes('—'));
check('retur baerer tekstVersion', vaelgNudgeKort(HOLDT, CTX)?.tekstVersion === 'v1');

process.exit(fejl ? 1 : 0);
