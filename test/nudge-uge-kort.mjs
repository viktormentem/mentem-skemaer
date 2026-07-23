// nudge-uge-kort.mjs - ugentligt refleksions-kort: tally, tærskler, prioritet, tekster.
// Koer: node test/nudge-uge-kort.mjs
import { vaelgUgeKort, UGE_KORT_TEKST, UGE_UDFORDRING_FRASE } from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) console.log(`  ✓ ${navn}`);
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}
// entry med givet kort-id (null = nat uden kort). Ekstra felter for firewall-test.
const n = (id, extra = {}) => ({ nudgeKort: id ? { id, tekstVersion: 'v1' } : null, ...extra });

console.log('Fejring (holdt-vindue {C,E} >= 5):');
check('5xC -> fejring', vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('C'),n('A'),n('B')])?.variant === 'fejring');
check('C+E-mix >=5 -> fejring', vaelgUgeKort([n('C'),n('C'),n('C'),n('E'),n('E'),n('A'),n('A')])?.variant === 'fejring');
check('4 holdt + 3 A -> IKKE fejring (4<5)', vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('A'),n('A'),n('A')])?.variant !== 'fejring');

console.log('Stoettende fokus (dominerende udfordring >= 3):');
const fA = vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('A'),n('A'),n('A')]);
check('4 holdt + 3 A -> fokus', fA?.variant === 'fokus');
check('fokus A tekst baerer frasen + antal 3', fA?.tekst.includes(UGE_UDFORDRING_FRASE.A) && fA?.tekst.includes('3 nætter'));
const fD = vaelgUgeKort([n('D'),n('D'),n('D'),n('D'),n('C'),n('C'),n(null)]);
check('4 D -> fokus D, antal 4', fD?.variant === 'fokus' && fD?.tekst.includes(UGE_UDFORDRING_FRASE.D) && fD?.tekst.includes('4 nætter'));

console.log('Uafgjort -> prioritet A>B>D>F:');
check('3 A + 3 B -> fokus A', vaelgUgeKort([n('A'),n('A'),n('A'),n('B'),n('B'),n('B'),n(null)])?.tekst.includes(UGE_UDFORDRING_FRASE.A));
check('3 B + 3 D -> fokus B', vaelgUgeKort([n('B'),n('B'),n('B'),n('D'),n('D'),n('D'),n(null)])?.tekst.includes(UGE_UDFORDRING_FRASE.B));
check('3 A + 4 D -> fokus D (hyppigst vinder over prioritet)', vaelgUgeKort([n('A'),n('A'),n('A'),n('D'),n('D'),n('D'),n('D')])?.tekst.includes(UGE_UDFORDRING_FRASE.D));

console.log('Blid opmuntring (intet >=3, holdt <5):');
check('2 A + 2 C + 1 D + 2 null -> opmuntring', vaelgUgeKort([n('A'),n('A'),n('C'),n('C'),n('D'),n(null),n(null)])?.variant === 'opmuntring');

console.log('Defensivt gulv / robusthed:');
check('3 entries -> null', vaelgUgeKort([n('C'),n('C'),n('C')]) === null);
check('ikke-array -> null', vaelgUgeKort(null) === null);
check('entries uden nudgeKort tælles ikke (giver opmuntring, ikke crash)',
  vaelgUgeKort([n(null),n(null),n(null),n(null)])?.variant === 'opmuntring');
check('daytimeSleepiness i entry ændrer intet (firewall)',
  vaelgUgeKort([n('C',{daytimeSleepiness_0_10:9}),n('C'),n('C'),n('C'),n('C'),n('A'),n('A')])?.variant === 'fejring');

console.log('Tekster:');
for (const v of ['fejring','fokus','opmuntring'])
  check(`variant ${v} dash-fri (em + en) + tekstVersion`, (() => {
    const arr = v === 'fejring' ? [n('C'),n('C'),n('C'),n('C'),n('C'),n(null),n(null)]
      : v === 'fokus' ? [n('A'),n('A'),n('A'),n('C'),n(null),n(null),n(null)]
      : [n('A'),n('A'),n('C'),n('C'),n('D'),n(null),n(null)];
    const k = vaelgUgeKort(arr);
    return k?.variant === v && k.tekstVersion === 'v1'
      && !k.tekst.includes('—') && !k.tekst.includes('–')
      && !k.titel.includes('—') && !k.titel.includes('–');
  })());

process.exit(fejl ? 1 : 0);
