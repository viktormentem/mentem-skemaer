// soevn-dagbog-periode-kontrakt.mjs — `?d=`-kontrakten mellem Mentem-appen og dagbogssiden.
// Kør: node test/soevn-dagbog-periode-kontrakt.mjs
//
// Batch-post 3 (AUDIT 25/7) bad om at `d=`-adfærden blev BESLUTTET og testet frem for
// utilsigtet. Under målingen viste noten sig at have forkert præmis: `d=` klampes IKKE til
// 1..60 — værdier uden for intervallet KASSERES tavst og siden falder tilbage til
// CSD_DEFAULT_DAYS. Og appens standard-periode er 90.
//
// 🔴 Derfor er dette ikke en dokumentations-prøve men en fitness function mod et ægte brud:
//   app  (PsykologInvitation): SoevnSendKanaler.standardPeriodeDage = 90, clampPeriode → 1..90,
//        buildSoevndagbogUrl vedhæfter `&d=<plannedDays>` ⇒ standard-linket bærer `d=90`.
//   web  (denne fil):          diaryPlannedDays() accepterede kun d <= 60 ⇒ 90 kasseret ⇒ 14.
// Konsekvens hos klienten: perioden LÅSES ved første åbning (diaryState.plannedDays), så
// »Du har udfyldt X af N dage« og payloadens plannedDays fryser på det forkerte tal for hele
// forløbet. Ingen fejl vises nogen steder — den tavse retning.
//
// Prøven læser den ÆGTE funktion ud af index.html og kører den, frem for at gentage
// grænsen som en konstant her. En kopi af tallet ville være grøn præcis når den var forkert.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) { console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

// ── Udtræk kilden, så prøven ikke kan blive grøn på en forældet kopi ──────────
const defMatch = html.match(/const CSD_DEFAULT_DAYS\s*=\s*(\d+)\s*;/);
check('CSD_DEFAULT_DAYS findes i index.html', !!defMatch);
const CSD_DEFAULT_DAYS = defMatch ? Number(defMatch[1]) : NaN;

const fnMatch = html.match(/function diaryPlannedDays\(\)\s*\{[\s\S]*?\n\}/);
check('diaryPlannedDays() findes i index.html', !!fnMatch);
if (!fnMatch || !defMatch) { console.error('\nKilde-udtræk fejlede — kontrakten kan ikke måles.'); process.exit(1); }

/// Kør den ÆGTE funktions-krop med et givet ?d=.
/// Kørt i en tom `vm`-kontekst med kun de to variabler funktionen læser: kilden er vores egen
/// fil i samme repo, men et udtrukket kode-uddrag skal køre i en kasse uanset hvor det kom fra
/// (ingen require, intet process, intet fs). Billigere end at genskrive logikken her — og en
/// genskrevet kopi ville netop være grøn i det øjeblik kilden holdt op med at matche den.
function plannedDaysFor(dParam) {
  return runInNewContext(`${fnMatch[0]}\ndiaryPlannedDays();`,
    { dParam, CSD_DEFAULT_DAYS }, { timeout: 1000 });
}

// ── Appens kontrakt. Tallene er appens, ikke denne fils præference ────────────
// SoevnSendKanaler.standardPeriodeDage (SoevnDagbogSendViewController.swift:696) = 90
// SoevnSendKanaler.clampPeriode                        (:701-704) = min(90, max(1, n))
const APP_STANDARD_PERIODE = 90;
const APP_MAX_PERIODE = 90;

console.log('Appens standard-link skal virke (det bærende krav):');
check(`d=${APP_STANDARD_PERIODE} accepteres`, plannedDaysFor(APP_STANDARD_PERIODE) === APP_STANDARD_PERIODE,
  `fik ${plannedDaysFor(APP_STANDARD_PERIODE)} — appens standard-periode kasseres tavst og bliver ${CSD_DEFAULT_DAYS}`);
check(`d=${APP_MAX_PERIODE} (appens clampPeriode-maksimum) accepteres`,
  plannedDaysFor(APP_MAX_PERIODE) === APP_MAX_PERIODE, `fik ${plannedDaysFor(APP_MAX_PERIODE)}`);

console.log('Hele appens tilladte interval skal komme igennem uændret:');
for (const d of [1, 7, 14, 21, 30, 60, 89, 90]) {
  check(`d=${d} → ${d}`, plannedDaysFor(d) === d, `fik ${plannedDaysFor(d)}`);
}

console.log('Uden for appens interval: fald tilbage til default, aldrig et opdigtet tal:');
// 🔴 Bevidst BESLUTTET adfærd (post 3): en værdi appen aldrig kan udstede er en redigeret URL.
// Vi klamper IKKE (det ville forære en fremmed værdi en tilsyneladende gyldig periode) —
// vi falder tilbage til default, som er den eneste værdi vi selv står inde for.
for (const d of [0, -1, 91, 365, 100000]) {
  check(`d=${d} → default (${CSD_DEFAULT_DAYS})`, plannedDaysFor(d) === CSD_DEFAULT_DAYS,
    `fik ${plannedDaysFor(d)}`);
}
check('intet d= → default', plannedDaysFor(null) === CSD_DEFAULT_DAYS, `fik ${plannedDaysFor(null)}`);
check('NaN (uparsbart d=) → default', plannedDaysFor(NaN) === CSD_DEFAULT_DAYS, `fik ${plannedDaysFor(NaN)}`);

console.log('Grænsen må ikke kunne sænkes under appens maksimum uden at prøven bliver rød:');
const boundMatch = fnMatch[0].match(/dParam\s*<=\s*(\d+)/);
check('øvre grænse er eksplicit i kilden', !!boundMatch);
check(`øvre grænse >= appens ${APP_MAX_PERIODE}`, boundMatch && Number(boundMatch[1]) >= APP_MAX_PERIODE,
  boundMatch ? `kilden siger ${boundMatch[1]}` : 'ingen grænse fundet');

console.log(fejl === 0 ? '\nALLE GRØNNE' : `\n${fejl} RØDE`);
process.exit(fejl === 0 ? 0 : 1);
