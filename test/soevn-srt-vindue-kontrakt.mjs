// soevn-srt-vindue-kontrakt.mjs — M1.6: verbatim-lås af SRT-copy i web-laget.
// Låser web-gengivelsen ORD-FOR-ORD mod srt-klient-tekst-laas-2026-06-02.md
// (Tekst 1/2/3 em-dash-fri re-lås 26/6 · Tekst 4 SM3 · F1 26/6 · F2 4/6).
// Enhver afvigelse = rød (fidelity før stil; Swift-single-source opdateres FØRST).
// Kør: node test/soevn-srt-vindue-kontrakt.mjs

import { SKEMAER, SRT_VINDUE_TEKST, SOEVN_F1, SOEVN_F2, CSD_SOEVNDAGBOG }
  from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) { console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

console.log('SRT-vindue registrering:');
check('SKEMAER.soevnvindue findes', !!SKEMAER.soevnvindue);
check('kind = srtVindue', SKEMAER.soevnvindue.kind === 'srtVindue');
check('ikon = seng (eget vektor-ikon)', SKEMAER.soevnvindue.icon === 'seng');

console.log('Tekst 1 · vinduesTekst (verbatim):');
check('heading', SRT_VINDUE_TEKST.vindue.startsWith('**Dit søvnvindue**'));
check('kerne-sætning', SRT_VINDUE_TEKST.vindue.includes(
  'Dit søvnvindue er den periode, du må være i sengen lige nu: fra **{sengetid}** til **{opvågning}**.'));
check('menneske-i-loop-slutning', SRT_VINDUE_TEKST.vindue.includes(
  'Vi justerer vinduet undervejs ud fra din dagbog.'));

console.log('Tekst 2 · SC-regler (verbatim):');
check('heading', SRT_VINDUE_TEKST.scRegler.startsWith('**Sådan bruger du sengen**'));
check('SC1 klokke-fri (låst)', SRT_VINDUE_TEKST.scRegler.includes(
  '**Forlad sengen, hvis du føler dig vågen eller frustreret, uden at kigge på uret.**'));
check('5 punkter', SRT_VINDUE_TEKST.scRegler.split('\n').filter(l => l.startsWith('- ')).length === 5);

console.log('Tekst 3 · kørsels-advarsel (verbatim, Edinger p.50):');
check('heading', SRT_VINDUE_TEKST.koerselsAdvarsel.startsWith('**Vigtigt om sikkerhed den første uge**'));
check('kerne-advarsel', SRT_VINDUE_TEKST.koerselsAdvarsel.includes(
  '**undgå aktiviteter, hvor søvnighed kan være farlig for dig, for eksempel at køre langt eller betjene farlige maskiner.**'));

console.log('GK4 · blød compression-vinduestekst (verbatim):');
check('intro', SRT_VINDUE_TEKST.gk4.includes(
  'De næste uger justerer vi langsomt den tid, du er i sengen, så den kommer til at passe bedre til den søvn, din krop faktisk bruger.'));
check('sikkerheds-ventil', SRT_VINDUE_TEKST.gk4.includes(
  'mærker du, at det bliver for hårdt, så sig til, så tilpasser vi.'));

console.log('F1 · Søvnighed i dag (verbatim, Viktor 26/6):');
check('titel', SOEVN_F1.titel === 'Søvnighed i dag');
check('prompt', SOEVN_F1.prompt ===
  'Hvor søvnig har du følt dig i løbet af dagen i dag? Tænk på, hvor tæt du har været på at døse hen eller falde i søvn, mens du var i gang med noget.');
check('anker0', SOEVN_F1.anker0 === 'slet ikke søvnig, klar og vågen hele dagen');
check('anker10', SOEVN_F1.anker10 === 'ekstremt søvnig, kæmpede for at holde mig vågen');

console.log('F2 · Sikkerhed i dag (verbatim, Viktor 4/6) + Tekst 4 (SM3, 2/6):');
check('titel', SOEVN_F2.titel === 'Sikkerhed i dag');
check('prompt', SOEVN_F2.prompt ===
  'Var du i dag tæt på en ulykke på grund af træthed, eller faldt du i søvn et sted, hvor det kunne være farligt (fx bag rattet, ved en maskine)?');
check('placeholder', SOEVN_F2.placeholder ===
  'Du behøver ikke skrive noget, men hvis du vil, kan du fortælle kort, hvad der skete.');
check('mikrotekst', SOEVN_F2.mikro ===
  'Det her er ikke noget, du kan svare forkert på. Vælger du "Ja", hører jeg det med det samme, og vi finder ud af det sammen.');
check('Tekst 4 åbning', SOEVN_F2.failsafe.startsWith('**Tak fordi du fortæller mig det.**'));
check('Tekst 4 anti-skam', SOEVN_F2.failsafe.includes(
  'Det er ikke noget, du har gjort forkert. Vi justerer.'));
check('Tekst 4 handling: vante tider', SOEVN_F2.failsafe.includes(
  'Sov efter dine vante tider i nat. Læg dig, når du plejer, og bliv i sengen, så længe du har brug for.'));
check('Tekst 4 handling: kørsel', SOEVN_F2.failsafe.includes(
  'Lad være med at køre bil eller betjene maskiner, før du føler dig udhvilet.'));
check('Tekst 4 handling: skriv', SOEVN_F2.failsafe.includes(
  'Skriv til mig hurtigst muligt, så finder vi den rigtige justering sammen.'));
check('knap', SOEVN_F2.knap === 'Skriv til Viktor');

console.log('Tankestregs-regel (egen copy, 19/6):');
const alSrtCopy = JSON.stringify(SRT_VINDUE_TEKST) + JSON.stringify(SOEVN_F1) + JSON.stringify(SOEVN_F2);
check('0 em-dash', !alSrtCopy.includes('—'));
check('0 en-dash', !alSrtCopy.includes('–'));

console.log('Baseline-urørthed (strukturelt):');
const srtFelter = CSD_SOEVNDAGBOG.fields.filter(f => f.srtOnly);
check('alle nye dagbogs-felter er srtOnly (baseline uberørt)',
  srtFelter.length === 3 && srtFelter.every(f =>
    ['daytimeSleepiness_0_10', 'incidentFlag', 'incidentNote'].includes(f.key)));
check('ingen committed defaults på nye felter', srtFelter.every(f => f.default == null));

if (fejl) { console.error(`\nKONTRAKT RØD: ${fejl} afvigelse(r)`); process.exit(1); }
console.log('\nSRT-VINDUE-KONTRAKT GRØN');
