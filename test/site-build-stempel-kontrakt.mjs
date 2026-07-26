// site-build-stempel-kontrakt.mjs — `meta.siteBuild` skal være en MÅLING, ikke en håndholdt streng.
// Kør: node test/site-build-stempel-kontrakt.mjs   (exit 0 = alle grønne)
//
// HULLET (målt 26/7): `SITE_BUILD = '2026-06-01-fase1'` har stået uændret siden 1. juni og
// følger med i HVER eneste klient-aflevering som `meta.siteBuild`. Den er ikke bare forældet —
// den er den forkerte KLASSE af værdi: et menneske skrev den, så den beskriver hvad nogen
// mente den dag, ikke hvad der faktisk kørte da klienten trykkede send. I en obduktion er
// det værre end ingenting, for den ser ud som om nogen havde målt.
//
// Siden 26/7 findes den ægte måling: `<meta name="mentem-deploy-sha">`, indsat af deployet
// (INFRA, deploy-script 20:22) og læst ind i afsender-stemplet før nogen payload bygges.
// Så der er nu TO svar på samme spørgsmål i samme payload — `afsender.webDeploySha` (målt)
// og `meta.siteBuild` (håndholdt) — og det ene af dem er altid forkert.
//
// KONTRAKTEN: der er ÉT svar. `meta.siteBuild` ER den målte herkomst. Ukendt ⇒ null.
// Vi gætter ALDRIG en build — samme fail-closed-regel som `webDeploySha` og `?v=`.
//
// 🔴 Prøven har to halvdele med vilje. Adfærds-tjekkene kan holdes grønne af en kopi af
// konstanten; KILDE-vagten nederst er den der gør det umuligt at genindføre en håndholdt
// streng ved siden af. En prøve der kun måler output ville være grøn dagen efter nogen
// skrev `meta.siteBuild = SITE_BUILD_2026_08` tilbage.
//
// 🟢 DE TO HALVDELE ER PRØVET MOD HINANDEN MED MUTANTER (26/7), efter MYCEL COMPANIONs fund
// samme aften: et værn skal prøves, ikke læses — deres regex-vagt var beviseligt blind og
// målte flittigt på det forkerte. Seks mutanter plantet i kilden:
//   M1 `SITE_BUILD` genindført · M2 `BUILD_STAMP` · M3 `DEPLOY_VERSION` · M4 `SITE_REVISION`
//      → alle DRÆBT af kilde-vagten.
//   M5 `UDGAVE_STAMP = '2026-08-01-fase2'` (navnet undgår alle seks nøgleord), UBRUGT
//      → OVERLEVEDE. Målt og accepteret: en ubrugt konstant kan ikke nå en klient.
//   M6 samme navn, men faktisk tildelt `meta.siteBuild`
//      → DRÆBT af adfærds-halvdelen, som ikke ser på navne overhovedet.
// 🔵 Dét er hele arbejdsdelingen: kilde-vagten fanger genindførelsen mens den endnu er
// hensigt, adfærds-halvdelen fanger enhver værdi der faktisk når payloaden, uanset hvad
// nogen kalder den. M5 er grænsen, og den er skrevet her frem for at lade nogen tro at
// vagten er bredere end den er.

import { readFileSync } from 'node:fs';
import {
  setAfsenderKontekst,
  afsenderStempel,
  buildPayloadCSD,
} from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) { console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}
function eq(navn, fik, vil) {
  check(navn, JSON.stringify(fik) === JSON.stringify(vil), `fik ${JSON.stringify(fik)}, ville ${JSON.stringify(vil)}`);
}

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';   // 40 hex, som deployet stempler
const NATTER = [{ date: '2026-07-01', bedtime: '23:00', lightsOut: '23:15', sleepLatencyMin: 20 }];

const metaFor = (kontekst) => {
  setAfsenderKontekst(kontekst);
  return buildPayloadCSD(NATTER, { plannedDays: 90 });
};
/// Payloaden er envelope-wrappet (PR-2): den flade CSD-payload ligger i `.data`.
const csd = (konvolut) => (konvolut && konvolut.data) ? konvolut.data : konvolut;

console.log('\n── 1. Ukendt herkomst ⇒ vi påstår ingenting ──────────────────');
{
  const p = csd(metaFor(null));
  eq('meta.siteBuild er null når intet deploy-stempel kunne måles', p.meta.siteBuild, null);
  eq('afsender.webDeploySha er null i samme tilstand', p.afsender.webDeploySha, null);
}

console.log('\n── 2. Målt herkomst ⇒ stemplet ER målingen ───────────────────');
{
  const p = csd(metaFor({ webDeploySha: SHA, linkVersion: '953' }));
  eq('meta.siteBuild er den målte deploy-SHA', p.meta.siteBuild, SHA);
  eq('afsender.webDeploySha er den samme SHA', p.afsender.webDeploySha, SHA);
}

console.log('\n── 3. ÉT svar, ikke to — de kan ikke divergere ───────────────');
// Det bærende tjek. To felter der besvarer samme spørgsmål skal komme fra samme kilde,
// ellers er det kun et spørgsmål om tid før de er uenige — og så ved en obduktion ikke
// hvilket af dem den skal tro på.
for (const ktx of [null, { webDeploySha: SHA }, { webDeploySha: 'ikke-en-sha' }, {}]) {
  const p = csd(metaFor(ktx));
  eq(`meta.siteBuild === afsender.webDeploySha (ktx=${JSON.stringify(ktx)})`,
     p.meta.siteBuild, p.afsender.webDeploySha);
}

console.log('\n── 4. Skrald bliver aldrig til et gæt (positiv kontrol) ──────');
// Rens-reglen ligger allerede i rensDeploySha; her måles at siteBuild ARVER den frem for
// at have sin egen. En 404-HTML-side og en afkortet SHA er de to former vi faktisk har set.
for (const raa of ['<!DOCTYPE html>', 'a1b2c3d', '', '   ', 'A1B2C3D4E5F60718293A4B5C6D7E8F901234567', null, 42]) {
  const p = csd(metaFor({ webDeploySha: raa }));
  eq(`meta.siteBuild er null for ${JSON.stringify(raa)}`, p.meta.siteBuild, null);
}
{
  // …og en gyldig SHA i STORE bogstaver ER en måling — den normaliseres, den kasseres ikke.
  const p = csd(metaFor({ webDeploySha: SHA.toUpperCase() }));
  eq('meta.siteBuild normaliserer en gyldig SHA i versaler', p.meta.siteBuild, SHA);
}

console.log('\n── 5. Kilde-vagt: ingen håndholdt build-streng må overleve ───');
{
  const core = readFileSync(new URL('../mentem-skema-core.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  check('mentem-skema-core.js eksporterer ikke længere en SITE_BUILD-konstant',
        !/export\s+const\s+SITE_BUILD\s*=/.test(core));

  // Selve fejlformen, uafhængigt af navnet: en dato-agtig streng-literal tildelt noget der
  // navngiver den KØRENDE UDGAVE. Fanger `const BUILD_STAMP = '2026-08-01-fase2'` lige så godt.
  //
  // 🔴 VAGTEN VAR FOR BRED I FØRSTE UDGAVE, og den fældede en uskyldig: den tog også
  // `SENDT_KVITTERING_VERSION = '2026-07-15'`. Den er en COPY-version — hvilken ORDLYD
  // klienten så — og den ER ærligt håndholdt, fordi et menneske skrev teksten den dag. Der
  // findes ingen måling at erstatte den med. Havde vagten stået bred, ville den have tvunget
  // en rigtig værdi væk for at holde sig selv grøn, og næste gang nogen tilføjede en legitim
  // indholds-version, ville prøven have sagt fra uden at have ret. Derfor måles navne der
  // betyder »hvilken KODE kører« (build/deploy/site/commit/revision/sha) — ikke »hvilken
  // TEKST blev vist«.
  // 🟢 MÅLT MOD MYCEL COMPANIONs FEJLKLASSE (22:01): »et kvantificeret krav inde i et mønster
  // med ENSARTEDE afgrænsere« — samme tegn åbner og lukker, så et lukkende tegn kan parres
  // med et FJERNT åbnende og indholdet derimellem forsvinde. Mønsteret herunder HAR den form
  // (`['"]` … `['"]` med `\d{4}-\d{2}-\d{2}` indeni), så det skulle prøves, ikke antages.
  // Seks tilfælde målt — kort/lang streng foran, en anden dato imellem, begge citattegn,
  // blandede — alle fanget. Grunden er strukturel og er allerede kuren COMPANION peger på:
  // `[^'"]*` forbyder anførselstegn INDENI, så et match kan aldrig spænde over en
  // strenggrænse. Ændrer nogen den klasse til `.*` eller `[\s\S]*`, falder vagten i præcis
  // det hul — og det er lettere gjort end det ser ud.
  const haandholdt = core.match(/const\s+\w*(BUILD|DEPLOY|SITE|COMMIT|REVISION|SHA)\w*\s*=\s*['"]\d{4}-\d{2}-\d{2}[^'"]*['"]/gi) || [];
  check('ingen håndholdt dato-streng som build-stempel i core', haandholdt.length === 0,
        haandholdt.join(' | '));

  check('index.html importerer ikke længere SITE_BUILD fra core',
        !/^[^\n]*\bSITE_BUILD\b[^\n]*$/m.test(html.split('</script>')[0].split('import')[1] || '') ||
        !/\bSITE_BUILD\b/.test(html));

  check('index.html bruger ikke SITE_BUILD nogen steder', !/\bSITE_BUILD\b/.test(html),
        (html.match(/^.*\bSITE_BUILD\b.*$/m) || [''])[0].trim().slice(0, 90));

  // Diagnostik-linjen er Viktors eneste vindue ind i en klients krypto-fejl. Står der en
  // forkert `ver=` dér, sender den ham efter den forkerte udgave.
  const diag = (html.match(/function byggDiagnostikLinje[\s\S]*?\n\}/) || [''])[0];
  check('byggDiagnostikLinje findes stadig i index.html', diag.length > 0);
  check('diagnostik-linjens ver= læser den målte herkomst',
        /ver=/.test(diag) && /webDeploySha|afsenderStempel/.test(diag),
        diag.split('\n').find((l) => l.includes('ver=')) || '(ingen ver=-linje)');
}

console.log(fejl === 0
  ? '\n✅ site-build-stempel-kontrakt: alle grønne\n'
  : `\n❌ site-build-stempel-kontrakt: ${fejl} fejl\n`);
process.exit(fejl === 0 ? 0 : 1);
