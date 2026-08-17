// Faelles forudsaetnings-gates for de harnesser der kraever en lokal ingest-worker
// (inbox-enroll-seeit.mjs, inbox-fase2-seeit.mjs, e2e-autosend.mjs).
//
// To gates, samme princip: en forudsaetning der ikke er opfyldt er UMAALT (rc 3), aldrig
// ROED (rc 1) og aldrig et tavst nul. `kraevWorkerEvne` spoerger om workeren KAN det der
// maales; `kraevSyntetiskNoegle` skaffer selv den noegle der skal til, eller siger fra.
//
// 🔴 HVORFOR DEN FINDES (maalt 16/8). Begge harnesser stod ROED i folketaellingen med
// »waiting for locator('#screen-done.active')«. Det ligner en aegte fejl i fladen, og det
// er det ikke: den worker der svarede paa 127.0.0.1:8787 har slet ikke enroll-ruten.
//   /health                    -> 200   (POS-KTRL: workeren lever, naalen kan se en rute)
//   /submit uden token         -> 401
//   /webauthn/register/options -> 404   (den rute siden FAKTISK kalder)
//   /zzqxq-findes-ikke         -> 404   (NEG-KTRL: 404 betyder ogsaa 404)
// Klient-inbox lag 1 bor paa den ULANDEDE gren
// `feat/klient-inbox-fase2-swift-udgaaende-2026-07-14` (13/7), praecis som
// `webauthn-authenticator.mjs` goer for soesterproeverne. De to VERA-soestre fik rc 3
// UMAALT den 15/8; de to See-it-varianter af samme par blev glemt. Samme fejlklasse som
// `e2e-besked-fase-b` mod `e2e-autosend` 14/8: soesteren blev rettet, denne blev ikke.
//
// 🔵 EN ROED DER BETYDER »IKKE RELEVANT ENDNU« ER LIGE SAA MISVISENDE SOM ET FALSK GROENT.
// Forskellen er hvem der gaar og kigger: paa en roed leder naeste lane efter en fejl i en
// flade der virker.
//
// 🔴 OG DEN FANGER EN TIL, som var den egentlige aarsag til at fundet var svaert at se:
// runnerens »vent paa /health« kan ikke skelne MIN worker fra en FREMMED der allerede
// ligger paa porten. Der stod en efterladt `wrangler dev` fra 14/8 kl. 21:22 og lyttede
// paa 8787 i 38 timer. Health svarede 200, saa runneren gik videre, og walken maalte mod
// en worker den ikke selv havde startet. **En parathedsnaal der kun spoerger »svarer der
// nogen« kan ikke svare paa »svarer den RIGTIGE«.** Evne-gaten spoerger om ruten, ikke om
// liv, og derfor ser den forskellen.

import fs from 'node:fs';
import path from 'node:path';

const RC_UMAALT = 3;

const probe = async (url, init) => {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
    return r.status;
  } catch {
    return null;   // intet svar overhovedet: ingen socket, ikke en http-status
  }
};

/**
 * Afgoer om workeren paa `apiBase` overhovedet KAN maales af denne harness.
 * Afgiver ingen dom naar den ikke kan: den skriver aarsagen ud og afslutter med rc 3.
 * Returnerer kun (uden vaerdi) naar walken er meningsfuld at koere.
 *
 * @param {string} apiBase   fx http://127.0.0.1:8787
 * @param {string} rute      den rute siden FAKTISK kalder, fx /webauthn/register/options
 * @param {string} harness   navn til fejlteksten
 * @param {string} runner    filnavnet paa den runner der rejser en worker. 🔴 Skrives ud af
 *                           KALDEREN, fordi den ikke kan udledes: min foerste udgave gaettede
 *                           `run-${harness}.sh` og pegede dermed paa `run-e2e-autosend.sh`,
 *                           som ikke findes (den hedder `run-autosend-e2e.sh`). En fejltekst
 *                           der navngiver en fil der ikke findes, sender naeste lane forkert vej.
 */
export async function kraevWorkerEvne(apiBase, rute, harness, runner) {
  const doed = (...linjer) => { for (const l of linjer) console.error(l); process.exit(RC_UMAALT); };

  const pos = await probe(`${apiBase}/health`);
  const neg = await probe(`${apiBase}/zzqxq-findes-ikke-${Date.now()}`);

  // Husets regel: et maaleskript NAEGTER at doemme naar dets EGEN kontrol fejler.
  // Uden POS kan vi ikke se en rute der findes; uden en 404 paa NEG kan vi ikke se en
  // rute der ikke findes, og saa er »404 paa enroll« ikke et fund men stoej.
  if (pos === null) {
    doed(
      `UMAALT: ingen worker svarer paa ${apiBase} (${harness}).`,
      '  Harnessen kraever en lokal ingest-worker.',
      `  Start den med test/${runner}, som rejser en og river den ned igen.`,
      '  Ingen dom afgivet.',
    );
  }
  if (pos !== 200 || neg !== 404) {
    doed(
      `UMAALT: INSTRUMENTET ER DOEDT, ingen dom (${harness}).`,
      `  POS-KTRL ${apiBase}/health forventet 200, fik ${pos}.`,
      `  NEG-KTRL en ikke-eksisterende rute forventet 404, fik ${neg}.`,
      '  Uden begge kan gaten ikke skelne »ruten mangler« fra »alt svarer ens«.',
    );
  }

  const evne = await probe(`${apiBase}${rute}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  if (evne === 404) {
    doed(
      `UMAALT: ${rute} svarer 404 paa den worker der lytter (${harness}).`,
      `  POS-KTRL /health = 200 og NEG-KTRL = 404, saa maalingen er god: ruten er der ikke.`,
      '  Klient-inbox lag 1 bor paa den ULANDEDE gren',
      '  feat/klient-inbox-fase2-swift-udgaaende-2026-07-14 (13/7).',
      '  Denne harness er FOR TIDLIG, ikke i stykker, og kan foerst koere naar grenen er landet.',
      '  🔴 Tjek ogsaa om en FREMMED worker ligger paa porten: en efterladt `wrangler dev`',
      '     svarer 200 paa /health og faar runnerens parathedsnaal til at gaa videre.',
      `     lsof -nP -iTCP:${new URL(apiBase).port} -sTCP:LISTEN`,
      '  Ingen dom afgivet.',
    );
  }
}

// ── syntetisk token-noegle ───────────────────────────────────────────────────
//
// 🔴 HVORFOR DEN IKKE MAA MOENTE EN NY (maalt 15/8 og igen 16/8). Alle tre harnesser
// signerede deres token med `<workerDir>/test/.synthetic-key.json`, og faldt tilbage paa
// raadet »koer `npm run gen-key`«. Det raad er en faelde: gen-key moenter et NYT
// noeglepar, og workeren verificerer mod den pubkey der er PINNET i `.dev.vars`
// (`INGEST_TOKEN_PUBKEY`). En frisk noegle giver derfor et token workeren afviser, og
// afvisningen ligner alt muligt andet end »forkert noegle«.
// **En selvhelbredelse der producerer en ny hemmelighed, helbreder ikke, den flytter
// fejlen hen et sted hvor den er svaerere at se.** Kuren er at KOPIERE den noegle der
// allerede matcher pinningen, og ellers sige fra.
//
// 🔵 Og defaulten pegede paa `/private/tmp/wt-ingest-d1-eu/ingest-worker`, en worktree der
// er ryddet. En sti der ikke findes, er ikke en default, det er en doed maaler: harnessen
// kunne ikke starte, og bag den laa en anden fejl ingen kunne se (14/8).

const laesPinnetPubkey = (workerDir) => {
  const dv = path.join(workerDir, '.dev.vars');
  if (!fs.existsSync(dv)) return null;
  const m = fs.readFileSync(dv, 'utf8').match(/^INGEST_TOKEN_PUBKEY=(\S+)/m);
  return m ? m[1] : null;
};

const pubkeyIFil = (fil) => {
  try { return JSON.parse(fs.readFileSync(fil, 'utf8'))?.pubJwk?.x ?? null; } catch { return null; }
};

// Soeskendetraeer: alle <MEMTEM>/<noget>/ingest-worker/test/.synthetic-key.json.
const soeskendeKandidater = (workerDir) => {
  const rod = path.resolve(workerDir, '../..');            // fx ~/Developer/MEMTEM
  let poster = [];
  try { poster = fs.readdirSync(rod); } catch { return []; }
  return poster
    .map((n) => path.join(rod, n, 'ingest-worker/test/.synthetic-key.json'))
    .filter((f) => f !== path.join(workerDir, 'test/.synthetic-key.json') && fs.existsSync(f));
};

/**
 * Sikrer at `<workerDir>/test/.synthetic-key.json` findes OG matcher den pubkey der er
 * pinnet i `<workerDir>/.dev.vars`. Kopierer den fra et soeskendetrae hvis den mangler.
 * Moenter ALDRIG en ny. Afgiver ingen dom (rc 3) naar den ikke kan skaffe en gyldig.
 *
 * @returns {string} absolut sti til en brugbar noeglefil
 */
export function kraevSyntetiskNoegle(workerDir, harness) {
  const doed = (...linjer) => { for (const l of linjer) console.error(l); process.exit(RC_UMAALT); };
  const maal = path.join(workerDir, 'test/.synthetic-key.json');

  if (!fs.existsSync(workerDir)) {
    doed(
      `UMAALT: worker-traeet findes ikke: ${workerDir} (${harness}).`,
      '  Saet WORKER_DIR= mod det kanoniske trae:',
      '    ~/Developer/MEMTEM/PsykologInvitation/ingest-worker',
      '  Ingen dom afgivet.',
    );
  }

  // POS-KTRL for hele gaten: uden den pinnede pubkey kan vi ikke afgoere OM en noegle
  // passer, og saa maa vi heller ikke sige at den goer.
  const pinnet = laesPinnetPubkey(workerDir);
  if (!pinnet) {
    doed(
      `UMAALT: INGEST_TOKEN_PUBKEY kunne ikke laeses i ${workerDir}/.dev.vars (${harness}).`,
      '  Uden den pinnede pubkey kan gaten ikke skelne den rigtige noegle fra en ny.',
      '  Ingen dom afgivet.',
    );
  }

  if (fs.existsSync(maal)) {
    const x = pubkeyIFil(maal);
    if (x === pinnet) return maal;
    doed(
      `UMAALT: ${maal} matcher IKKE den pinnede pubkey (${harness}).`,
      `  .dev.vars pinner  ${pinnet}`,
      `  noeglefilen har   ${x ?? '(ulaeselig)'}`,
      '  Et token signeret med den ville blive afvist af workeren, og afvisningen ligner',
      '  ikke »forkert noegle«. Dette er praecis det `npm run gen-key` efterlader.',
      '  Kur: slet filen og koer harnessen igen, saa kopierer gaten den rigtige ind.',
      '  Ingen dom afgivet.',
    );
  }

  for (const kandidat of soeskendeKandidater(workerDir)) {
    if (pubkeyIFil(kandidat) !== pinnet) continue;
    fs.mkdirSync(path.dirname(maal), { recursive: true });
    fs.copyFileSync(kandidat, maal);
    console.log(`   forudsaetning: kopierede syntetisk noegle fra ${kandidat}`);
    console.log(`   (pubkey matcher .dev.vars: ${pinnet.slice(0, 12)}...)`);
    return maal;
  }

  doed(
    `UMAALT: ingen syntetisk noegle der matcher den pinnede pubkey (${harness}).`,
    `  Soegt i ${workerDir}/test/ og i soeskendetraeernes ingest-worker/test/.`,
    `  Pinnet i .dev.vars: ${pinnet}`,
    '  🔴 KOER IKKE `npm run gen-key`. Den moenter et NYT par, som workeren vil afvise.',
    '  Den private halvdel skal kopieres fra et trae der allerede har den.',
    '  Ingen dom afgivet.',
  );
}
