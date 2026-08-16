// harness-daekning-vagt.mjs — hvor mange af husets egne maalere kan overhovedet STARTE?
//
// 🔴 HVORFOR DEN FINDES (15/8). `e2e-autosend.mjs` havde vaeret ukoerbar siden 20/6, fordi
// `migrate:local` navngav en D1 der var omdoebt. Den fejl SKJULTE en anden fejl bagved
// (proeven klikkede paa en knap der var blevet skjult 14/8). To doede maalere ovenpaa
// hinanden, og den yderste skjulte den inderste i to maaneder.
// Samme dag fandt en folketaelling to KONTRAKT-proever der havde vaeret roede siden 12/8,
// fordi screeningen fik et paakraevet felt og deres fiksturer ikke fulgte med. Ingen saa
// det, fordi ingen koerte dem.
//
// 🔵 DEN MAALER DAEKNING, IKKE KORREKTHED. »32 groenne« er ikke en kvalitetsdom; det er
// svaret paa »hvor mange af vores maalere er i live«. En harness der ikke kan starte, er
// hverken groen eller roed , og den forskel er hele pointen.
//
//   node build-tools/harness-daekning-vagt.mjs            # rapport
//   node build-tools/harness-daekning-vagt.mjs --json     # maskinlaesbart
//
// rc 0  ingen harness er ROED
// rc 1  mindst een er ROED (en maaler der kom i gang og sagde fra)
// rc 3  UMAALT: POS-KTRL faldt, altsaa kan vagten ikke starte en harness den VED er groen
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST = path.join(ROD, 'test');
const JSON_UD = process.argv.includes('--json');
// 🔴 POS-KTRL-emnet er hardkodet MED VILJE: det skal vaere en harness vi ved er groen, og
// den viden kan ikke udledes. Falder DEN, er det vagten der er i stykker, ikke huset.
const POS_KTRL = 'selftest.mjs';

const DOED = [
  [/Cannot find (module|package)/i, 'manglende modul'],
  [/ENOENT|no such file or directory/i, 'manglende fil'],
  [/Mangler .*n(ø|oe)gle|synthetic-key/i, 'manglende syntetisk noegle'],
  [/Couldn't find a D1|wrangler.*not found/i, 'manglende worker/D1'],
  [/Mangler worker-dir|kr(æ|ae)ver en k(ø|oe)rende worker/i, 'worker koerer ikke'],
  [/command not found/i, 'manglende binaer'],
];
// 🔴 NET-naalen var FOR BRED og skjulte et fund (maalt 15/8). `Timeout.*exceeded` fangede
// ogsaa Playwrights ELEMENT-timeout (»waiting for locator('#share-btn')«), saa
// `soevn-screening-smoke` , en aegte ROED med praecis samme aarsag som de to andre
// share-btn-harnesser , blev klassificeret NET og afgav derfor »ingen dom« i stedet for at
// raabe op. **En naal der er for bred, skjuler et fund**, og den skjuler det som en
// UMAALT-lignende kategori, hvilket er vaerre end en falsk roed: ingen gaar og kigger.
// Nu kraeves et NETVAERKS-ord, og Playwrights element-ventning er eksplicit undtaget.
const NET = [
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i, 'netvaerk/tjeneste'],
  [/connect ETIMEDOUT/i, 'timeout mod en tjeneste'],
];
// Playwright-timeouts der IKKE er netvaerk: de venter paa DOM, ikke paa en socket.
const IKKE_NET = /waiting for locator|element is not visible|waiting for selector|page\.(click|waitForSelector|waitForFunction)/i;

// 🔴 VAERKTOEJ UDLEDES, DET LISTES IKKE. En haandskrevet liste raadner i det oejeblik nogen
// tilfoejer et vaerktoej mere, og saa baerer taellingen en falsk ROED for evigt.
// Naalen er filens egen brugslinje med et PAAKRAEVET argument: `Brug: node ... <noget>`.
// `encrypt-fixture.mjs` er det maalte tilfaelde: den kaldes af Swift-proeven
// StaticSiteCryptoRoundTripTests og kraever en pubkey, saa den kan ikke koeres nøgen.
const erVaerktoej = (fil) => {
  const t = readFileSync(path.join(TEST, fil), 'utf8').slice(0, 2000);
  return /^\/\/\s*Brug:.*<[^>]+>/m.test(t);
};

const koer = (fil, args = []) => new Promise((res) => {
  execFile('node', [path.join('test', fil), ...args], { cwd: ROD, timeout: 150000 },
    (err, out, errout) => res({ rc: err ? (err.code ?? -1) : 0, ud: `${out}${errout}` }));
});

const klassificer = (rc, ud) => {
  if (rc === 3) return ['UMAALT', (ud.trim().split('\n')[0] || '').slice(0, 70)];
  for (const [m, hv] of DOED) if (m.test(ud)) return ['DOED', hv];
  if (!IKKE_NET.test(ud)) for (const [m, hv] of NET) if (m.test(ud)) return ['NET', hv];
  return rc === 0 ? ['GROEN', ''] : ['ROED', (ud.trim().split('\n').pop() || '').slice(0, 70)];
};

// 🔴 `_`-praefiks = DELT MODUL, ikke en harness. Maalt 16/8: `_forudsaetning.mjs` (delt
// forudsaetnings-gate) blev talt med som harness og rapporteret GROEN rc 0, fordi den ikke
// goer noget naar den koeres nøgen. **En fil der ikke maalte noget, er ikke groen, den er
// tavs** , og den loeftede samtidig populationen fra 40 til 41, saa summen saa ud til at
// stemme. Samme klasse som `VAERKTOEJ` nedenfor: en fil der ikke kan koeres alene, maa ikke
// taelles som en der blev koert alene.
// 🔵 Praefikset er naalen frem for en haandskrevet liste, fordi en liste raadner naeste gang
// nogen tilfoejer et modul mere (samme argument som `erVaerktoej`).
const filer = readdirSync(TEST)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
  .sort();

// ── POS-KTRL FOERST. Uden den kan »alle doede« ikke skelnes fra »vagten startede dem
// forkert«, og det var praecis foerste koersels resultat: 39 af 39 doede, fordi den kaldte
// `node <navn>` fra roden i stedet for `node test/<navn>`. En uniform katastrofe er
// naesten altid maaleren.
const pk = await koer(POS_KTRL);
if (pk.rc !== 0) {
  console.error(`UMAALT: POS-KTRL ${POS_KTRL} gav rc ${pk.rc}. Vagten kan ikke starte en harness`);
  console.error('den VED er groen, saa ingen dom afgives over nogen af de andre.');
  process.exit(3);
}

const rows = [];
for (const f of filer) {
  if (erVaerktoej(f)) { rows.push([f, 'VAERKTOEJ', 0, 'kraever argument, kaldes af en anden']); continue; }
  const { rc, ud } = await koer(f);
  const [k, hv] = klassificer(rc, ud);
  rows.push([f, k, rc, hv]);
}

if (JSON_UD) { console.log(JSON.stringify(rows, null, 1)); }
else {
  console.log(`POS-KTRL: ${POS_KTRL} groen -> vagten kan starte en harness`);
  console.log(`POPULATION: ${filer.length} .mjs i test/\n`);
  for (const [f, k, rc, hv] of rows) console.log(`  ${k.padEnd(9)} ${f.padEnd(44)} rc=${String(rc).padEnd(4)} ${hv}`);
}

const tael = (k) => rows.filter((r) => r[1] === k).length;
const klasser = ['GROEN', 'ROED', 'DOED', 'NET', 'UMAALT', 'VAERKTOEJ'];
if (!JSON_UD) {
  console.log('');
  for (const k of klasser) console.log(`  ${k.padEnd(9)} ${String(tael(k)).padStart(3)}`);
  // 🔴 Summen SKAL vaere populationen. Ellers har en klasse spist en anden i tavshed, og
  // det er praecis hvad der skete da UMAALT manglede: DOED faldt, ROED steg, summen saa ens ud.
  const sum = klasser.reduce((a, k) => a + tael(k), 0);
  console.log(`  ${'sum'.padEnd(9)} ${String(sum).padStart(3)}  ${sum === filer.length ? '= populationen' : '🔴 TABTE FILER'}`);
  console.log(`\n🔵 DAEKNING, ikke korrekthed. ${tael('DOED') + tael('NET') + tael('UMAALT')} harness(er) afgav INGEN dom.`);
}
process.exit(tael('ROED') > 0 ? 1 : 0);
