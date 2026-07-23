// copy-guard-test.mjs — tester for VERA-guard #2 (synlig-copy-guard).
//
// HVORFOR DENNE TEST: guarden er selv klient-copy-kritisk infrastruktur. En guard der
// tavst ikke tjekker er VÆRRE end ingen guard (den giver falsk tryghed). Derfor testes
// BÅDE at den FANGER (positiv-kontrol) og at den IKKE fanger legitim tekst (falsk-positiv-
// kontrol) — samt at den FEJLER HØJLYDT når en fil ikke kan parses.
//
// Kør:  node test/copy-guard-test.mjs      (exit 0 = grøn, 1 = fejl)

import {
  extractVisibleCopy, scanCopy, runCopyGuard, triageCopy, COPY_GUARDED_FILES, PENDING_VIKTOR_GO,
} from './copy-guard.mjs';

let fails = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { fails++; console.error(`  ✗ ${name}${detail ? `  [${detail}]` : ''}`); }
}
const S = (t, f = 't.html') => scanCopy(t, f);
const kinds = (t) => S(t).map(v => v.kind).join(',');
const found = (t) => S(t).map(v => v.found).join(',');

console.log('\ncopy-guard: EKSTRAKTION af synlig copy');

// Kernen: kun det klienten FAKTISK ser må scannes. Rå-byte-scan er forkert (index.html
// bærer 69 em-dash i kommentarer som ingen klient ser) — derfor denne ekstraktion.
check('HTML-tekstnode = synlig copy',
  extractVisibleCopy('<p>Hej med dig</p>', 't.html').some(s => /Hej med dig/.test(s.text)));
check('HTML-kommentar er IKKE synlig copy',
  !extractVisibleCopy('<!-- engangs-skema -->', 't.html').some(s => /engangs/.test(s.text)));
check('<style> er IKKE synlig copy',
  !extractVisibleCopy('<style>.a{border-radius:4px}</style>', 't.html').some(s => /border-radius/.test(s.text)));
check('JS-linjekommentar er IKKE synlig copy',
  !extractVisibleCopy('<script>// engangs-skema her\n</script>', 't.html').some(s => /engangs/.test(s.text)));
check('JS-strengliteral ER synlig copy',
  extractVisibleCopy('<script>el.textContent = "Din søvndagbog er sendt";</script>', 't.html')
    .some(s => /Din søvndagbog er sendt/.test(s.text)));
check('tekst-attribut (aria-label) ER synlig copy (skærmlæser læser den op)',
  extractVisibleCopy('<button aria-label="Luk vinduet">x</button>', 't.html').some(s => /Luk vinduet/.test(s.text)));
check('ikke-tekst-attribut (class) er IKKE synlig copy',
  !extractVisibleCopy('<div class="diary-field nrs-field"></div>', 't.html').some(s => /diary-field/.test(s.text)));

console.log('\ncopy-guard: FANGER (positiv-kontrol — de 3 fejl Viktor selv fandt 16/7)');

check('fanger "engangs-skema" i HTML-tekstnode', found('<p>Du har fået et engangs-skema.</p>') === 'engangs-skema');
check('fanger "søvn-svar" i JS-streng',
  found('<script>const t = "Dine søvn-svar er gemt";</script>') === 'søvn-svar');
check('fanger "terapi-forløb" (Viktors egen 27/6-eksempel)', found('<p>dit terapi-forløb</p>') === 'terapi-forløb');
check('fanger bindestreg med stort forbogstav ("Psykiater-henvisning")',
  found('<p>Psykiater-henvisning er valgt.</p>') === 'sykiater-henvisning');
check('fanger em-dash i synlig copy', kinds('<p>Sådan — og så videre</p>') === 'em-dash');
check('fanger en-dash brugt som tankestreg', kinds('<p>Sådan – og så videre</p>') === 'en-dash');
// En guard der peger på den forkerte linje bliver ignoreret. Multi-linje-template-literaler
// må IKKE rapportere fejlen på literalens åbningslinje (målt: 9 linjer ved siden af).
check('linjenummer peger på FEJLEN, ikke på template-literalens åbningslinje', (() => {
  const src = ['<script>', 'const h = `', '  <p>første linje</p>', '  <p>en engangs-skema her</p>', '`;', '</script>'].join('\n');
  const v = S(src);
  return v.length === 1 && v[0].line === 4 && /engangs-skema her/.test(v[0].raw);
})(), JSON.stringify(S(['<script>', 'const h = `', '  <p>første linje</p>', '  <p>en engangs-skema her</p>', '`;', '</script>'].join('\n')).map(x => [x.line, x.raw])));
check('raw viser den FAKTISKE sætning fejlen står i (ikke en nabosætning)',
  S('<p>Sætning A.</p>\n<p>Her er et engangs-skema.</p>')[0].raw === 'Her er et engangs-skema.');
// En ${...} over flere linjer må ikke "spise" sine newlines ud af linjeregnskabet.
check('multi-linje-${interpolation} forskyder IKKE linjenummeret', (() => {
  const src = ['<script>', 'const h = `', '  <p>${a', '    ? "x"', '    : "y"}</p>', '  <p>et engangs-skema</p>', '`;', '</script>'].join('\n');
  const v = S(src);
  return v.length === 1 && v[0].line === 6;
})(), JSON.stringify(S(['<script>', 'const h = `', '  <p>${a', '    ? "x"', '    : "y"}</p>', '  <p>et engangs-skema</p>', '`;', '</script>'].join('\n')).map(x => x.line)));

check('fejlbesked er NYTTIG: filnavn + fund + forslag + hvorfor', (() => {
  const v = S('<p>et engangs-skema</p>', 'index.html')[0];
  return v && v.file === 'index.html' && v.found === 'engangs-skema'
    && /engangsskema/.test(v.fix) && /ét ord/i.test(v.why);
})());

console.log('\ncopy-guard: FANGER IKKE (falsk-positiv-kontrol)');

check('IKKE "GAD-7" (forkortelse+tal)', S('<p>GAD-7 og PHQ-9 og WHO-5</p>').length === 0);
check('IKKE "STOP-Bang" (forkortelse+egennavn)', S('<p>STOP-Bang screening</p>').length === 0);
check('IKKE "Stanley-Brown" (egennavn)', S('<p>Stanley-Brown sikkerhedsplan</p>').length === 0);
check('IKKE "uge 1-3" (talinterval)', S('<p>uge 1-3 og kl. 9-05</p>').length === 0);
check('IKKE "0–100 %" (en-dash som talinterval = korrekt dansk typografi)',
  S('<p>vis hvor stor del af tiden (0–100 %) du oplevede</p>').length === 0);
check('IKKE "ind- og udånding" (gruppesammensætning, fælles led skrevet én gang)',
  S('<p>mærk din ind- og udånding</p>').length === 0);
check('IKKE "e-mail" (kort led)', S('<p>send en e-mail</p>').length === 0);
check('IKKE CSS-selektor i JS', S('<script>document.querySelector(".diary-field nrs-field");</script>').length === 0);
check('IKKE className-tildeling', S('<script>el.className = "question-block answered";</script>').length === 0);
check('IKKE import-sti', S('<script>import x from "./mentem-skema-core.js";</script>').length === 0);
check('IKKE fetch-URL', S('<script>fetch("/api/soevn-draft/" + id);</script>').length === 0);
check('IKKE CSS i style-streng', S('<script>el.style.cssText = "border-radius:7px;font-size:13px";</script>').length === 0);

console.log('\ncopy-guard: INSTRUMENT-REGIONER (fidelity > stil, Viktor 19/6)');

const instr = [
  '<script>',
  '// emdash-guard:instrument-start (PHQ-9 verbatim)',
  'const q = "Dårlig mening om dig selv — eller en følelse af at du er en fiasko";',
  '// emdash-guard:instrument-end',
  '</script>',
].join('\n');
check('em-dash i instrument-region er UNDTAGET', S(instr).length === 0);
const efterInstr = instr + '\n<p>Din søvn-svar blev sendt — tak</p>';
check('regionen LUKKER igen (copy efter -end er dækket)', S(efterInstr).length === 2,
  S(efterInstr).map(v => v.kind).join(','));

console.log('\ncopy-guard: ALLOW-markør');
check('nudansk-guard:allow-markør respekteres',
  S('<p>et engangs-skema</p> <!-- nudansk-guard:allow: testbegrundelse -->').length === 0);
check('markør UDEN begrundelse tæller IKKE (allowlist uden begrundelse = skraldespand)',
  S('<p>et engangs-skema</p> <!-- nudansk-guard:allow -->').length === 1);

console.log('\ncopy-guard: INGEN SILENT CAPS (uparsbar fil skal fejle HØJLYDT)');
let threw = false;
try { extractVisibleCopy('<script>const s = "uafsluttet streng\n</script>', 't.html'); }
catch (e) { threw = /uafsluttet|unterminated/i.test(e.message); }
check('uafsluttet streng -> kaster (springer IKKE filen tavst over)', threw);
threw = false;
try { extractVisibleCopy('<script>const s = `uafsluttet template;</script>', 't.html'); }
catch (e) { threw = /uafsluttet|unterminated/i.test(e.message); }
check('uafsluttet template -> kaster', threw);

console.log('\ncopy-guard: PENDING-liste kan kun krympe (ikke en allowlist i forklædning)');
check('kendt fund tælles som pending, ikke som nyt', (() => {
  const v = [{ file: 'a.html', found: 'test-visning' }];
  const t = triageCopy(v, [{ file: 'a.html', found: 'test-visning' }]);
  return t.nye.length === 0 && t.stale.length === 0 && t.pendingFundet === 1;
})());
check('pending-post der IKKE længere findes = stale = FEJL (tvinger oprydning efter rettelse)', (() => {
  const t = triageCopy([], [{ file: 'a.html', found: 'test-visning' }]);
  return t.stale.length === 1;
})());
check('ukendt fund er stadig NYT (pending dækker ikke naboer)', (() => {
  const t = triageCopy([{ file: 'a.html', found: 'engangs-skema' }], [{ file: 'a.html', found: 'test-visning' }]);
  return t.nye.length === 1 && t.stale.length === 1;
})());
check('hver pending-post bærer forslag + note (ingen ubegrundede poster)',
  PENDING_VIKTOR_GO.every(p => p.file && p.found && p.forslag && p.note));

console.log('\ncopy-guard: LIVE-flade');
check(`guardede filer = hele fladen (${COPY_GUARDED_FILES.join(', ')})`,
  COPY_GUARDED_FILES.includes('index.html') && COPY_GUARDED_FILES.includes('mentem-skema-core.js')
  && COPY_GUARDED_FILES.includes('anmod.html'));
const live = runCopyGuard();
const { nye, stale, pendingFundet } = triageCopy(live);
if (nye.length) {
  console.error(`  ! ${nye.length} NYE fund i live-flade:`);
  for (const v of nye) console.error(`     ${v.file}:${v.line} [${v.kind}] "${v.found}" -> ${v.fix}`);
}
check('0 NYE overtrædelser i live klient-flade', nye.length === 0, `${nye.length} nye`);
check('0 stale pending-poster', stale.length === 0, stale.map(p => p.found).join(','));
console.log(`  i ${pendingFundet} kendte fund afventer Viktor-GO (se PENDING_VIKTOR_GO):`);
for (const p of PENDING_VIKTOR_GO) console.log(`     ${p.file}: "${p.found}" → ${p.forslag}  (${p.note})`);

console.log(fails === 0 ? '\ncopy-guard-test ✓ alle grønne' : `\ncopy-guard-test ✗ ${fails} fejl`);
process.exit(fails === 0 ? 0 : 1);
