// mentem-skema-core.js - MCT-skema-kadence kerne (P1a)
//
// Miljø-agnostisk ES-modul: kører identisk i browser (<script type="module">)
// OG i Node 18+ (round-trip-harness + selftest). Ren WebCrypto - INGEN
// tredjeparts-krypto-lib, INGEN privat/prod-nøgle (KRYPTO-GUARD: static-site
// har KUN modtagerens PUBLIC X25519-nøgle og KRYPTERER; kun Mentem dekrypterer).
//
// Krypto-kontrakt (SKAL matche Mentems E2EKryptering.swift PRÆCIST):
//   Curve25519 (X25519) ECDH → HKDF-SHA256(salt, info="TherapyCopilot-E2E-Export-v1", 32B)
//   → AES-256-GCM. Container = KrypteretEksportContainer (ciphertext + tag SEPARAT,
//   ISO8601-datoer UDEN fraktioner - CryptoKit .iso8601 afviser millisekunder).
//
// Spec: noter/spec-mct-skema-kadence-2026-05-31.md v1.3 (§3, §4, §9, §12, R3, R5).

// ════════════════════════════════════════════════════════════════════════
//  SKEMA-DEFINITIONER
// ════════════════════════════════════════════════════════════════════════
// Kanonisk rækkefølge (proces-spine først, så symptom/outcome/funktion, alliance sidst).
export const SKEMA_ORDER = ['cas', 'mcb', 'gad7', 'phq9', 'who5', 'wsas', 'waisr'];

// ── Offentligheds-/licensgate (rod-gap-luk · batteri-velkomst-licenslæk 2026-06-27) ──
// SKEMA_ORDER bærer bevidst ingen KLAR/licensstatus (nøgle-isolation). OFFENTLIGT_KLAR er
// det PARALLELLE register (analogt til instrument-KLAR-gaten): ét sted, der afgør hvilke
// spørgeskemaer der må vises på en offentlig/uautentificeret flade. Det driver BÅDE den
// offentlige batteri-allowlist (renderWelcome → `selected`) OG den generiske footer-credit,
// så vi aldrig navngiver et enkelt instrument på velkomstskærmen (generisk copy fjerner
// licensnavne-skønnet permanent, Viktor V90). Et fremtidigt licens-pending skema fjernes
// blot herfra → kan ikke længere rendres offentligt, uden at SKEMA_ORDER røres.
//
// 'cas' + 'mcb' FJERNET fra offentlig visning 2026-07-03 (Viktor-beslutning, Wells-licens):
// de må IKKE sendes/rendres digitalt → administreres kun på papir og indtastes separat
// i klient-record. SKEMA_ORDER + SKEMAER-definitionerne bevares (licens-pending-mønster);
// et stale/manuelt ?s=cas-link filtreres bort her → ufuldstændigt-link-skærm.
//
// 🔴 PRÆCISERING 2026-07-18 (vigtig, læs før du rører noget her):
// Nøglerne 'cas' og 'mcb' er UHELDIGT NAVNGIVNE. Indholdet under dem er IKKE Wells' CAS-1
// og IKKE MCQ-30. Det er VIKTORS EGNE formuleringer af de metakognitive konstrukter, skrevet
// i dagligdags dansk til klienter ("Tid brugt på grublen (at tænke igen og igen over problemer
// eller fortiden)"). De viste titler er derfor også neutrale: "Ugens mønstre" / "Tanker om
// bekymring". Wells' faktiske instrument har sin egen, INAKTIVE plads: CAS1_INSTRUMENT_SLOT
// (KLAR:false) længere nede i filen.
//
// Hvorfor præciseringen står her: navnesammenfaldet har allerede fået mindst én læser til at
// tro, at Viktors egen tekst var Wells' instrument, og dermed til at fejlvurdere licens-status.
// Nøglen omdøbes IKKE, fordi den er lagringsnøgle (answers.cas / out.cas) og et skifte ville
// bryde historiske klient-records. Rettelsen hører derfor i navngivningens BETYDNING, ikke i
// dens bogstaver.
//
// Ophavsretligt (vurdering 18/7, noter/vurdering-ophavsret-cas-mcb-2026-07-18.html): egen
// ordlyd trækker mod ophavsretslovens § 4 stk. 2 (nyt og selvstændigt værk). Wells' RET gælder
// hans eget udtryk og den digitale gengivelse af det; den gælder IKKE metoden som sådan.
// Se også instrument-licensregister-kanonisk-2026-07-18.md § 3c og § 3f.
//
// WAI-SR ('waisr', alliance-selvrapport) SAFE-FAIL-ekskluderet 2026-07-03: en allowlist
// må kun bære bekræftet-OK instrumenter. Koden annoterer det "frit/public domain", men det
// er en påstand i kilden, ikke en Viktor-ratificeret licens+egnetheds-bekræftelse. Holdes ude
// til Viktor bekræfter (reversibelt: tilføj 'waisr' igen her + genindsæt alliance-checkpoint).
export const OFFENTLIGT_KLAR = ['gad7', 'phq9', 'who5', 'wsas'];

// ── KLIENTENS RAEKKEFOELGE (Viktor-GO Q12=1, 2026-08-20) ────────────────────
// 🔴 HVORFOR DEN ER ET EGET REGISTER, og hvorfor det ikke er dobbeltarbejde.
// Indtil i nat var `OFFENTLIGT_KLAR` BEGGE dele: den afgjorde hvem der maatte vises
// (en LICENSGATE) og samtidig i hvilken orden (en UX-beslutning). index.html:1012
// filtrerede gennem den, saa `?s=`-raekkefoelgen blev kasseret og listens orden vandt.
//
// Foelgen var maalbar og ikke teoretisk: **for at give klienten en bedre raekkefoelge
// skulle man redigere en licensgate.** En gate der aendres af en UX-grund, holder op med
// at vaere en gate. Det er husets egen regel, og den staar allerede skrevet 40 linjer
// laengere oppe om et andet register: »En allowlist der baerer to slags tilladelse,
// holder op med at vaere en tilladelse.«
//
// 🟢 DE TO SKAL VAERE FORSKELLIGT ORDNET, MED VILJE. Var de ens, kunne ingen proeve se
// hvilken af dem koden faktisk laeste, og en mutant der byttede tilbage ville vaere
// groen. Forskellen ER maaleinstrumentet. Se test/raekkefoelge-gate.mjs.
//
// 🔵 RAEKKEFOELGEN, og begrundelsen bag hvert led (Viktor 20-08, Q12 mulighed 1):
//   who5  5 spm, positivt formuleret   -> laveste indgangstaerskel
//   wsas  5 spm, funktion              -> stadig kort, endnu ikke symptom
//   gad7  7 spm, symptom               -> hun er investeret naar det tunge kommer
//   phq9  9 spm, baerer selvmordsitemet -> SIDST, taettest paa skaermen med Akut hjaelp
// Maalt bonus paa en akse der ikke indgik i begrundelsen: denne orden giver 2 skalaskift,
// den gamle gav 3 (who5 og wsas har hver sin skala, gad7+phq9 deler FREQ_0_3).
//
// 🟡 MEDLEMSKAB VINDER OVER ORDEN. Et id her der IKKE staar i OFFENTLIGT_KLAR, maa ikke
// kunne vises. Filtret i index.html kraever begge, og gaten asserterer det.
export const KLIENT_RAEKKEFOELGE = ['who5', 'wsas', 'gad7', 'phq9'];

// ── LICENS-PROFILER (Viktor-beslutning 18/7 + 19/7) ─────────────────────────
// To forskellige rettigheder på SAMME flade, og de må ikke blandes sammen:
//
//   INTERN  = Viktors egen praksis. Han HAR gyldige licenser (fx Mapi Special Terms 140135
//             til ESS, intern klinisk brug). Alt i OFFENTLIGT_KLAR vises. **Denne profil er
//             urørt og skal blive ved at være det** — Viktor 19/7: det interne produkt må
//             ikke komme i vejen, så der altid kan vises en demo der FAKTISK virker.
//   PRODUKT = det der må følge med i et salg. Kun instrumenter der er frie til kommerciel
//             videredistribution, verificeret mod primærkilde med dato.
//
// 🔴 PORTEN ER IKKE PRIS. WHO-5 er gratis OG spærret (CC BY-NC-SA 3.0 IGO; NC forbyder at
// den indgår i et solgt produkt). Bygges automatikken på "gratis", ryger WHO-5 med ind ved
// første kunde og bryder licensen. Kriteriet er `kommercielt === true`, intet andet.
//
// 🔴 FAIL-CLOSED GÆLDER PRODUKTET, IKKE INSTALLATIONEN. Uverificeret (`null`) betyder
// "følger ikke med i et salg", ikke "forsvinder fra Viktors app". Ellers ville hver ny
// tvivl gøre hans eget værktøj fattigere, og så bliver det dyrt at registrere tvivl.
//
// Hvorfor profiler frem for at slette de spærrede: Mapi General Terms §3.1 er ordret
// "non-transferable, non-assignable, non-sublicensable" ⇒ Viktor kan IKKE købe én licens der
// dækker kunderne. Samme flade skal derfor kunne vise ESS hos ham og skjule det hos en kunde.
// Aftaletekst, ikke skøn. (Model A, noter/instrument-licensregister-kanonisk-2026-07-18.md.)
//
// NB om ordet "intern": det betyder "drevet af Viktors egen praksis", ikke "ikke på
// internettet". NC rammer kommerciel udnyttelse, ikke offentlig tilgængelighed — hans
// klienter må tilgå WHO-5 på et offentligt link; en kunde der har KØBT journalen må ikke.
export const PROFIL_INTERN = 'intern';
export const PROFIL_PRODUKT = 'produkt';

// Licens-fakta pr. instrument. `kommercielt`: true = fri til kommerciel videredistribution,
// false = beviseligt spærret, null = uverificeret (behandles som spærret i produktet).
// `verificeret` er datoen for opslag mod primærkilden — en påstand uden dato er ikke en
// verifikation. Kanonisk kilde: noter/instrument-licensregister-kanonisk-2026-07-18.md.
//
// ── `grundlag` = §3l-formen (Viktor-beslutning 2026-08-17) ──────────────────
// »Alle licensinstrumenter skal være helt afklaret før de kommer live der er klientvendt,
// fx ved at have dokumenteret det er gratis/open source eller hvilke betingelserne der skal
// være opfyldt.« To tilladte former og intet tredje:
//
//   'A'  FRIT      dokumenteret gratis/public domain/open source, med KILDE og dato
//   'B'  BETINGET  licens findes, og HVER betingelse står som en tjekbar række i
//                  `betingelser: [{ krav, status: 'opfyldt' | 'ikke opfyldt' }]`
//   null           INGEN FORM. Instrumentet hører ikke på en klientvendt flade.
//
// 🔴 HVORFOR FELTET STÅR HER OG IKKE I REGISTRET, og det er en rettelse af den oprindelige
// ordre (MYCEL BUILDER 17/8: »en vagt der krydser OFFENTLIGT_KLAR mod dette registers
// rækker«). Registret er `Projekt_Praksis/noter/…`, som er (a) et ANDET repo og (b)
// permanent gitignoreret pga. klient-PII: målt 17/8, `git check-ignore` rammer det på
// `/noter/*` og filen har 0 commits. En gate der dømte på det, ville hvile på noget der
// ikke følger med den commit den dømmer — husets egen målte fejlklasse (CLAUDE.md,
// »En dom må ikke hvile på noget der ikke er en del af det der dømmes«, 10/8).
// ⇒ Grundlaget er DATA I REPOET, registret er fortsat prosa-sandheden. `registerRef`
// bærer sporet tilbage, så de to kan afstemmes i hånden uden at gaten afhænger af det.
export const INSTRUMENT_LICENS = {
  gad7: { kommercielt: true, verificeret: '2026-07-18',
          kilde: 'Public domain siden 2010 (Pfizer frigav); ingen tilladelse noedvendig',
          grundlag: 'A',
          registerRef: 'instrument-licensregister-kanonisk-2026-07-18.md r.1' },
  phq9: { kommercielt: true, verificeret: '2026-07-18',
          kilde: 'Public domain siden 2010 (Pfizer frigav); ingen tilladelse noedvendig',
          grundlag: 'A',
          registerRef: 'instrument-licensregister-kanonisk-2026-07-18.md r.2' },
  who5: { kommercielt: false, verificeret: '2026-07-18',
          kilde: 'who.int WHO-UCN-MSD-MHE-2024.01: CC BY-NC-SA 3.0 IGO (NC = ingen salg, SA = afledte arver)',
          // Form A: dokumenteret gratis under en navngiven aaben licens, med kilde og dato.
          // NC/SA rammer VIDEREDISTRIBUTION (produkt-profilen), ikke om Viktors egne klienter
          // maa se den. De to porte er forskellige og maa ikke blandes sammen.
          grundlag: 'A',
          registerRef: 'instrument-licensregister-kanonisk-2026-07-18.md r.3' },
  // ── »wsas« ER IKKE LAENGERE ET LICENSINSTRUMENT (Viktor-GO »10=1«, 20-08 kl. 20.0x) ─────
  // Raekken stod fra 17/8 som INGEN FORM, fordi primaerkilden (Mundt et al. 2002) erklaerer
  // copyright hos I. M. Marks og henviser til en postadresse for tilladelse. Den analyse var
  // rigtig OM INSTRUMENTET og forkert om det der laa paa fladen: ordlyden har aldrig vaeret
  // WSAS'. Det var husets egen skala i WSAS' navn.
  // ⇒ Fladen er omdoebt til »Hverdag og funktion«, attributionen krediterer idéen og siger at
  // ordlyden er vores, og navnet, WSAS-skaeringspunkter og Marks-copyrighten er vaek.
  // Der er dermed ingen tredjepart at faa tilladelse fra. FORM A, og kilden er os selv.
  //
  // 🔴 TO TING DER IKKE ER LOEST HER, saa ingen laeser mere ud af raekken end der staar:
  //  1. `kommercielt` bliver staaende som null. Det betoed foer »rettighederne er uafklarede«
  //     og betyder nu »om vores egen skala maa i PRODUKTET, er en produktbeslutning«.
  //     `test/licens-profil-gate.mjs` laaser bevidst at wsas er UDE af produktprofilen, og
  //     den laas roeres ikke af en omdoebning.
  //  2. Id'et `wsas` deles fortsat med WSAS_INSTRUMENT_SLOT, som er den TOMME plads til det
  //     aegte instrument. To ting med samme noegle er en faelde den dag instrumentet
  //     licenseres, for saa kan gemte svar fra VORES skala ikke skelnes fra WSAS-scorer.
  //     Et id-skift roerer gemte klientsvar og er derfor ikke en omdoebnings-aendring.
  wsas: { kommercielt: null, verificeret: '2026-08-20',
          kilde: 'HUSETS EGEN SKALA. Fem items, 0-8, skrevet i huset (5adb585, samme commit som '
               + 'husets to andre egne skalaer cas og mcb). Maalt 17/8 item for item mod '
               + 'Mundt et al. (2002): items 2, 3 og 4 har mistet originalens opremsninger, '
               + 'item 1 har faaet indhold der ikke staar der, og item 5 er indsnaevret. '
               + 'Det er ikke en oversaettelse. Klientvendt navn siden 20-08: '
               + '»Hverdag og funktion«. Ingen tredjepartsrettigheder involveret.',
          grundlag: 'A',
          registerRef: 'kanonisk/registre/licens-register-kanonisk-2026-07-16.md §4.12' },  // nudansk-guard:allow: FILSTI i repoet: filen HEDDER licens-register-kanonisk-2026-07-16.md
// ── ESS: form B, og den ENESTE raekke her hvor licensen faktisk ER i hus ────────────────
// 🔴 Den staar her selv om `ess` IKKE er paa OFFENTLIGT_KLAR, og det er med vilje. §3l-gaten
// doemmer kun fladen, saa en raekke for et instrument UDEN FOR fladen koster ingen dom i dag.
// Men den dag nogen skriver `ess` ind i OFFENTLIGT_KLAR, gaar gaten ROED med de to
// betingelser NAVNGIVET, i stedet for at spoerge hvad status er. **En betingelse skrevet ned
// foer den er relevant, er den eneste slags der virker, naar den bliver det.**
  ess: { kommercielt: false, verificeret: '2026-06-26',
         kilde: 'Special Terms No 140135 (ePROVIDE/Mapi), Individual Practice, Effective 26 Jun 2026, '
              + 'term til 12/2028. Mode of administration = Electronic (paper back-up allowed), BYOD, '
              + 'e-Vendor = No. PDF paa disk: soevn/ess-licens/UA_special_terms_Viktor_Nielsen_ESS_140135.pdf',  // nudansk-guard:allow: FILSTI paa disk, ikke klient-copy. Maalt: filen HEDDER soevn/ess-licens/ og kan ikke omskrives uden at pege paa noget der ikke findes.
         grundlag: 'B',
         betingelser: [
           // nudansk-guard:allow: licensens EGET fagudtryk (Special Terms No 140135 §4.3), i et internt register der aldrig rendres til en klient. Maalt: 0 kaldesteder i render-stien.
           { krav: 'ICON LS-population (Special Terms 140135 §5): ICON LS populerer den danske '
                 + 'ordlyd ind i en teknisk fil VI leverer, vi uploader derfra, og screenshots af '
                 + 'OVERSAETTELSEN sendes til ICON LS. Husets nuvaerende tekst er en AFSKRIFT og maa '
                 + 'derfor ikke gaa klientvendt, uanset at ordlyden er korrekt.',
             status: 'ikke opfyldt' },
           { krav: 'Screenshot-review: ALLE elektroniske sider hvor ESS optraeder indsendes via '  // nudansk-guard:allow: licensens EGET fagudtryk (Special Terms 140135 §4.3); internt register, 0 kaldesteder i render-stien
                 + 'ePROVIDE til MRT/ICON LS for review og godkendelse (Special §4.3). '
                 + '»May incur additional fees«, beloeb ikke oplyst.',
             status: 'ikke opfyldt' },
           { krav: 'Dansk e-version via ICON LS: oversaettelsen populeres ind i en teknisk fil '
                 + 'der uploades, og screenshots sendes til ICON LS. Papirudgaven (AU1.0 dan-DK) '
                 + 'er i hus; e-versionen er et SEPARAT led.',
             status: 'ikke opfyldt' },
           { krav: 'Verbatim gengivelse, uaendret, med notitsen »ESS © MW Johns 1990-1997. '
                 + 'Used under License.« synlig paa siden (Special §5 + General §4.4).',
             status: 'opfyldt' },
           { krav: 'Stated Purpose bindende: kun intern klinisk brug i egen praksis. '
                 + 'Deling med andre psykologer eller kommerciel distribution kraever ny aftale.',
             status: 'opfyldt' },
         ],
         registerRef: 'soevn/ess-licens/ESS-licens-vurdering-2026-06-26.md' },

// ── ISI: form B, og den ANDEN raekke hvor licensen er i hus. Skrevet 20-08, samme dag som
// den blev accepteret, og FOER `isi` findes paa nogen flade. Samme begrundelse som ESS-blokken
// ovenfor: den dag nogen skriver `isi` ind i OFFENTLIGT_KLAR, gaar gaten ROED med hver
// betingelse NAVNGIVET frem for at spoerge hvad status er.
// 🔴 »Free of charge« gaelder LICENSEN, ikke arbejdet omkring e-versionen. Specific Terms
// siger to steder »may incur additional fees«, begge om screenshot-review og om ICON LS'
// populering af den danske ordlyd. Beloebet er ukendt og staar derfor som en betingelse.
  isi: { kommercielt: false, verificeret: '2026-08-20',
         kilde: 'To sager paa ePROVIDE/Mapi, begge Free of charge, accepteret 20-08 paa Viktors '
              + 'eksplicitte godkendelse. Sag 145419 = dansk (ISI-Last 2 weeks + ISI-Last month, '
              + 'Danish for Denmark). Sag 145425 = engelsk (Last 2 weeks eng-CA-USori originalen '
              + '+ Last month eng-GB). Context of use = Observational studies, Marketing, Clinical '
              + 'practice and Educational projects. Conditions of use = Not Funded. Mode = '
              + 'Electronic, BYOD. Filer paa disk: soevn/isi-licens/ (4 instrumenter + '  // nudansk-guard:allow: FILSTI paa disk: mappen HEDDER soevn/isi-licens/
              + 'ISI Users Manual.pdf). Vilkaarene i fuld ordlyd: '  // nudansk-guard:allow: FILSTI paa disk: mappen HEDDER soevn/isi-licens/
              + 'kanonisk/dokumentation/mapi-user-license-agreement-general-terms-2026-08-20.md',
         grundlag: 'B',
         betingelser: [
           // nudansk-guard:allow: licensens EGET fagudtryk (General Terms §4.4), i et internt register der aldrig rendres til en klient.
           { krav: 'Screenshot-review: General §4.4 er UBETINGET for akademisk/ikke-kommerciel '  // nudansk-guard:allow: licensens EGET fagudtryk (General Terms §4.4); internt register, 0 kaldesteder i render-stien
                 + 'brug, ordret »the User undertakes to submit the Screenshots of ALL the '
                 + 'electronic pages where the e-Version appears to MRT«. Samme pligt som ESS §5. '
                 + 'Falder foerst naar ISI-fladen findes; vaerktoej: '
                 + 'build-tools/lanes/licens-screenshots.mjs. »May incur additional fees«.',  // nudansk-guard:allow: FILSTI til vaerktoejet i repoet, ikke klient-copy
             // 🟢 KANALEN ER FUNDET OG BRUGT 20-08 kl. 19.3x, og den var ikke en mail.
             // ePROVIDEs »SUBMIT A REQUEST« er et rigtigt forloeb, ikke den knap uden felter
             // huset maalte tidligere samme dag: trin 1 »I have already downloaded a
             // questionnaire«, trin 2 »I want to submit screenshots of an electronic version«,
             // derefter emne, beskrivelse, COA-valg og filupload (10 MB pr. fil).
             // ESS-pakken er indsendt der: sag 2620356, status NEW, 9 skaermbilleder,
             // Budget Direct Fees €0.00 EUR. Svaret paa den afgoer ogsaa ISI's pris, fordi
             // anmodningen beder om et tilbud der daekker BEGGE instrumenter.
             // 🔴 Til sammenligning: 7 breve til 3 instrument-ejere har givet 0 menneskesvar.
             // En struktureret sag i leverandoerens eget system er en anden kanal end en mail
             // til en generisk postkasse, og den har et sagsnummer man kan henvise til.
             status: 'ikke opfyldt' },
           { krav: 'Copyright-notits (General §4.1): notitsen skal staa paa selve skemaet, og '  // nudansk-guard:allow: licensens EGET fagudtryk (General Terms §4.1); internt register, 0 kaldesteder i render-stien
                 + 'MRT kontaktoplysninger skal med ved enhver offentlig gengivelse. '
                 + 'Fladen findes ikke endnu, saa den kan ikke vaere opfyldt.',
             status: 'ikke opfyldt' },
           { krav: 'Dansk e-version: ICON LS populerer den danske ordlyd ind i den tekniske fil. '
                 + 'Papir/doc-udgaverne (AU2.1 og AU2.0, dan-DK) er i hus; e-versionen er et '  // nudansk-guard:allow: filformatet .doc som forled; det er en filtype og ikke et dansk sammensat ord
                 + 'SEPARAT led, praecis som ved ESS. »May incur additional fees«.',
             status: 'ikke opfyldt' },
           { krav: 'General §3.1: non-exclusive, non-transferable, non-assignable, '  // nudansk-guard:allow: licensens EGNE engelske fagudtryk, citeret fra General Terms §3.1; internt register
                 + 'non-sublicensable ⇒ maa IKKE deles med andre klinikker eller psykologer. '  // nudansk-guard:allow: licensens EGET engelske fagudtryk fra General Terms §3.1; internt register
                 + 'Uaendret fra ESS. Kommerciel distribution kraever en ny aftale.',
             status: 'opfyldt' },
           { krav: 'General §5.1: DATA TILHOERER BRUGEREN. Ingen betingelse at opfylde, men den '
                 + 'staar her fordi forskningssporet hviler paa den.',
             status: 'opfyldt' },
         ],
         registerRef: 'kanonisk/registre/licens-register-kanonisk-2026-07-16.md §4.8-4.10' },  // nudansk-guard:allow: FILSTI i repoet. Filen HEDDER licens-register-kanonisk og kan ikke omskrives uden at pege paa noget der ikke findes
};

// §3l-ratchettens GULV: de instrumenter der stod klientvendt live FØR reglen blev skrevet,
// og som endnu ikke har form A eller B. Listen er en MÅLT undtagelse med en dato og en ejer,
// ikke en tredje form: gaten fejler på ethvert NYT id uden form, og den fejler ogsaa hvis en
// række her er blevet OVERFLØDIG (grundlag kom i hus) eller DØD (id ikke længere på fladen).
// ⇒ Listen kan kun blive kortere. En undtagelse der ikke kan blive kortere, er et hul.
//
// 🔴 Hvorfor der overhovedet er et gulv: Viktor 19/7, »det interne produkt maa ikke komme i
// vejen«. At fjerne WSAS fra hans egen praksisflade er en produktbeslutning, ikke en
// infrastrukturbeslutning, og en vagt maa ikke traeffe den paa egen haand. Gulvet goer
// hullet SYNLIGT frem for at lukke det tavst i den ene eller den anden retning.
// 🟢 TOM SIDEN 20-08 kl. 20.0x, og det er hele pointen med et gulv: det kan kun blive
// kortere. `wsas` var den eneste raekke. Den blev ikke lukket af en tilladelse, men af at
// spoergsmaalet viste sig at vaere et andet: fladen baar et instruments NAVN over husets
// egen tekst. Omdoebningen fjernede tredjeparten, og dermed licensspoergsmaalet.
// Vagten fejler paa enhver NY flade uden form, saa en tom baseline er en gyldig tilstand
// og ikke et hul.
export const LICENS_3L_BASELINE = {};

// Allowlist for en given profil. Default er INTERN — en glemt parameter må ALDRIG kunne
// amputere Viktors egen flade. `licenser` er injicerbar, så gaten kan red-bevises uden at
// røre det ægte register (og uden delt tilstand mellem kald).
export function allowlistFor(profil = PROFIL_INTERN, licenser = INSTRUMENT_LICENS) {
  if (profil !== PROFIL_PRODUKT) return [...OFFENTLIGT_KLAR];
  // Fail-closed: kun eksplicit `kommercielt === true` slipper igennem. Et uregistreret
  // instrument har intet opslag ⇒ undefined ⇒ spærret. Derfor er gaten strukturel frem for
  // en liste nogen skal huske at vedligeholde.
  return OFFENTLIGT_KLAR.filter(id => licenser[id]?.kommercielt === true);
}

// Frekvens-svarmuligheder (PHQ-9 / GAD-7, 0-3).
const FREQ_0_3 = [
  { label: 'Slet ikke', value: 0 },
  { label: 'Adskillige dage', value: 1 },
  { label: 'Mere end halvdelen af dagene', value: 2 },
  { label: 'Næsten hver dag', value: 3 },
];

// WHO-5 svarmuligheder (0-5).
const WHO5_OPTS = [
  { label: 'På intet tidspunkt', value: 0 },
  { label: 'Lidt af tiden', value: 1 },
  { label: 'Lidt under halvdelen af tiden', value: 2 },
  { label: 'Lidt over halvdelen af tiden', value: 3 },
  { label: 'Det meste af tiden', value: 4 },
  { label: 'Hele tiden', value: 5 },
];

// WSAS svarmuligheder (0-8, vis kun yderpunkter + midte som ledetekst).
// 🔴 ENDEPUNKTERNE BAERER DERES ORD, og fundet er fra skaermen frem for fra koden
// (INFRA 21-08). Foer i dag var alle ni svarmuligheder BARE TAL, 0 til 8, uden ankre.
// Klienten skulle huske hvad 0 og 8 betyder fra instruktionslinjen ovenfor, mens hun
// scrollede gennem 45 knapper (5 items gange 9). Ved item 3 er den linje ude af skaermen.
//
// 🔵 Og skaermen viser det med det samme, fordi naboskemaet goer det modsatte: WHO-5 lige
// OVER dette baerer ord paa hver mulighed (»Lidt af tiden«). To skalaer paa samme skaerm,
// hvor den ene baerer sin betydning og den anden ikke goer.
//
// 🟢 Ordene er IKKE nye. De staar allerede ordret i skemaets egen `instruction`
// (»0 = slet ikke paavirket, 8 = meget svaert paavirket«). De er FLYTTET derhen hvor de
// bruges, ikke opfundet. Og fladen er husets EGEN skala, ikke et licensbundet instrument
// (se `attribution`), saa der er ingen fidelity-graense at bryde ved at maerke den.
//
// 🟡 KUN endepunkterne faar ord. 1 til 7 forbliver tal, fordi en 9-punkts skala med ni
// ordlyde tvinger klienten til at LAESE ni linjer frem for at maerke en afstand.
const WSAS_OPTS = Array.from({ length: 9 }, (_, v) => ({
  value: v,
  label: v === 0 ? '0 · Slet ikke påvirket'
       : v === 8 ? '8 · Meget svært påvirket'
       : String(v),
}));

// WAI-SR svarmuligheder (1-6).
const WAISR_OPTS = [
  { label: 'Sjældent', value: 1 },
  { label: 'Lejlighedsvist', value: 2 },
  { label: 'Af og til', value: 3 },
  { label: 'Tit', value: 4 },
  { label: 'Meget tit', value: 5 },
  { label: 'Altid', value: 6 },
];

export const SKEMAER = {
  // ── Egen-forfattet MCT-proces-spine (§12, fri klinisk metode) ──────────
  cas: {
    id: 'cas', kind: 'vas', title: 'Ugens mønstre', short: 'Ugens mønstre',
    icon: 'kompas', badge: '4 skalaer',
    instruction: 'Tænk på den seneste uge. Træk i hver skala for at vise, hvor stor del af tiden (0–100 %) du oplevede følgende. Der er ingen rigtige eller forkerte svar.',
    items: [
      { key: 'worry', text: 'Tid brugt på bekymring (om fremtiden, "hvad nu hvis…")' },
      { key: 'rumination', text: 'Tid brugt på grublen (at tænke igen og igen over problemer eller fortiden)' },
      { key: 'threat', text: 'Tid brugt på at holde øje med trusler eller fare (i kroppen, tankerne eller omgivelserne)' },
      { key: 'avoidance', text: 'Tid brugt på at undgå eller skubbe ubehagelige tanker væk' },
    ],
    vasMin: 'Slet ingen tid', vasMax: 'Næsten hele tiden',
  },
  // ── EMA: den MOMENTANE soester til `cas` (Viktor-direktiv 16/8) ────────
  //
  // 🔴 HVORFOR DEN IKKE ER CAS-1, og hvorfor det ikke er en mangel:
  // CAS-1 er forankret »over the past week« (Wells' egne manualer, husets arkiv).
  // Et uge-forankret item stillet 3 til 4 gange dagligt gensampler samme vindue op mod
  // 56 gange og maaler dermed ikke det momentane, som er hele grunden til at bruge EMA.
  // **Prompten KAN derfor ikke vaere instrumentet.** Den er noedvendigvis en tilpasning,
  // og saa er protokol-troskab ikke tilgaengelig som forsvar mod dataminimering:
  // art. 5(1)(c) gaelder fuldt, og faerrest mulige items er det rigtige.
  //
  // 🟢 Den er egen-forfattet paa husets egen proces-spine (§12, fri klinisk metode),
  // praecis som `cas` og `mcb`. Vi er ikke bundet af et publiceret item-saet.
  //
  // 🔵 NOEGLERNE ER GENBRUGT MED VILJE: `worry` deles med `cas`, `uncontrollability`
  // med `mcb`. Det er ikke kosmetik, det er hvad der goer at en momentan serie kan
  // laegges ved siden af den ugentlige maaling uden en oversaettelse imellem.
  //
  // 🟡 CAS-1 selv bevares hvor den ER gyldig: EEN gang som baseline i sin uge-form.
  // EMA bruges hvor den tilfoejer noget andet (Webb et al. 2025: EMA baerer
  // inkrementel validitet ud over konventionelle selvrapport-maal).
  ema: {
    id: 'ema', kind: 'vas', title: 'Lige nu', short: 'Lige nu',
    icon: 'kompas', badge: '2 skalaer',
    instruction: 'Tænk på tiden siden sidste gang du svarede. Træk i hver skala. Det tager under et minut, og der er ingen rigtige eller forkerte svar.',
    items: [
      { key: 'worry', text: 'Hvor stor del af tiden har du brugt på bekymring eller grublen?' },
      { key: 'uncontrollability', text: 'Hvor svært var det at stoppe igen, når det først var gået i gang?' },
    ],
    vasMin: 'Slet ingen tid', vasMax: 'Næsten hele tiden',
  },
  mcb: {
    id: 'mcb', kind: 'vas', title: 'Tanker om bekymring', short: 'Tanker om bekymring',
    icon: 'tanker', badge: '5 skalaer',
    instruction: 'Hvor enig er du i hvert udsagn lige nu? Træk i skalaen fra helt uenig til helt enig.',
    items: [
      { key: 'positive', text: 'At bekymre mig hjælper mig med at være forberedt og håndtere ting' },
      { key: 'uncontrollability', text: 'Når jeg først begynder at bekymre mig, kan jeg ikke stoppe det' },
      { key: 'danger', text: 'Min bekymring er skadelig eller farlig for mig' },
      { key: 'needcontrol', text: 'Det er vigtigt at have kontrol over mine tanker' },
      { key: 'selfconsciousness', text: 'Jeg lægger meget mærke til mine egne tanker og holder øje med, hvad jeg tænker' },
    ],
    vasMin: 'Helt uenig', vasMax: 'Helt enig',
  },
  // ── Symptom (frit/public domain) ───────────────────────────────────────
  // emdash-guard:instrument-start (validerede instrumenter GAD-7/PHQ-9/WHO-5): gengivet
  // VERBATIM fra kilden; em-dash-reglen gælder IKKE reproducerede instrumenter (CLAUDE.md-undtagelse,
  // Viktor 2026-06-19). Vores EGEN copy (CAS/MCB ovenfor, anmod, §2b) forbliver em-dash-fri + guardet.
  gad7: {
    id: 'gad7', kind: 'radio', title: 'GAD-7', short: 'Bekymring og uro', icon: 'sky', badge: '7 spørgsmål',
    instruction: 'Hvor tit har du været generet af følgende problemer i løbet af de seneste 2 uger?',
    options: FREQ_0_3, max: 21,
    items: [
      'Føler dig nervøs, angst eller på kanten',
      'Er ude af stand til at stoppe med at bekymre dig eller kontrollere din bekymring',
      'Bekymrer dig for meget om forskellige ting',
      'Har svært ved at slappe af',
      'Er så rastløs at det er svært at sidde stille',
      'Bliver nemt irritabel eller gnaven',
      'Føler dig bange, som om noget forfærdeligt kan ske',
    ],
  },
  phq9: {
    id: 'phq9', kind: 'radio', title: 'PHQ-9', short: 'Humør og energi', icon: 'sol', badge: '9 spørgsmål',
    instruction: 'Hvor tit har du været generet af følgende problemer i løbet af de seneste 2 uger?',
    options: FREQ_0_3, max: 27,
    items: [
      'Lille interesse eller glæde ved at gøre ting',
      'Følelse af at være nedtrykt, deprimeret eller håbløs',
      'Besvær med at falde i søvn, at sove igennem, eller omvendt at sove for meget',
      'Følelse af at være træt eller have meget lidt energi',
      'Dårlig appetit eller omvendt at spise for meget',
      'Dårlig mening om dig selv — eller en følelse af at du er en fiasko eller har svigtet dig selv eller din familie',
      'Besvær med at koncentrere dig om ting, f.eks. at læse avisen eller se fjernsyn',
      'At bevæge eller tale så langsomt at andre kunne have bemærket det — eller omvendt at være så rastløs at du bevæger dig mere end normalt',
      'Tanker om at du hellere ville være død, eller om at skade dig selv på en eller anden måde',
    ],
  },
  // ── Trivsel + funktion (frit m. attribution, R7.5) ─────────────────────
  who5: {
    id: 'who5', kind: 'radio', title: 'WHO-5', short: 'Generel trivsel', icon: 'plante', badge: '5 spørgsmål',
    instruction: 'Angiv for hvert af de fem udsagn, hvad der bedst beskriver, hvordan du har haft det i de seneste 2 uger.',
    options: WHO5_OPTS, max: 25,
    attribution: 'WHO-5 Trivselsindeks (1999). © WHO. CC BY-NC-SA 3.0 IGO.',
    items: [
      'Jeg har følt mig glad og i godt humør',
      'Jeg har følt mig rolig og afslappet',
      'Jeg har følt mig aktiv og energisk',
      'Jeg er vågnet frisk og udhvilet',
      'Min dagligdag har været fyldt med ting, der interesserer mig',
    ],
  },
  // emdash-guard:instrument-end
  // ── Hverdag og funktion: VORES EGEN skala (Viktor-GO »10=1«, 20-08 kl. 20.0x) ──────────
  // 🔴 Den hed »WSAS« indtil i aften, og baar en attribution med Marks' copyright over vores
  // egne fem linjer. Maalingen fra 17/8 (bevaret nedenfor) viste at ordlyden ALDRIG har
  // vaeret WSAS'. Navnet, ikke teksten, var det der var galt.
  // 🔴 Og den staar nu UDEN FOR emdash-guardens instrument-region med vilje: undtagelsen
  // gaelder verbatim gengivne instrumenter, og det her er husets egen copy. Item 5 baar en
  // em-dash netop fordi regionen frikendte den; den er rettet til en parentes.
  // 🟢 Den AEGTE WSAS har fortsat sin egen tomme plads i WSAS_INSTRUMENT_SLOT nedenfor
  // (KLAR:false, licensStatus 'afventer'). Omdoebningen lukker altsaa ikke vejen til
  // instrumentet, den skiller de to ad.
  wsas: {
    id: 'wsas', kind: 'radio', title: 'Hverdag og funktion', short: 'Hverdag og funktion', icon: 'puslespil', badge: '5 spørgsmål',
    // ── LEDESAETNING (Viktor-GO 21-08, valg A) ────────────────────────────
    // 🔴 HVORFOR DEN FINDES. Dette skema staar som NUMMER TO i batteriet og spoerger
    // »hvor meget paavirker DINE VANSKELIGHEDER ...«. En klient der endnu ikke selv har
    // navngivet et problem, moeder dermed en saetning der forudsaetter noget hun ikke har
    // sagt. Fundet paa skaermen 20-08, ikke i koden.
    //
    // 🔴 DEN STAAR OVER SKEMAET, ALDRIG INDE I ITEMSENE, og det er et krav frem for en
    // aestetik: et aendret item er et andet instrument. `instruction` og `items` er uroerte.
    //
    // 🔵 HVORFOR NETOP DENNE ORDLYD (Viktor valgte A af fire bud):
    //   den navngiver INTET. »Det, der fik dig til at soege hjaelp« lader klienten selv
    //   udfylde indholdet, hvor »dine vanskeligheder« paastaar en kategori paa hendes vegne.
    //   den er en HANDLING hun HAR foretaget, ikke en tilstand hun skal tilslutte sig.
    //   og den braekker ikke for en klient der er TILDELT gennem et netvaerk frem for selv
    //   at have soegt: saetningen bliver bredere, ikke forkert.
    ledesaetning: 'Tænk på det, der fik dig til at søge hjælp.',
    instruction: 'Hvor meget påvirker dine vanskeligheder din evne til følgende? 0 = slet ikke påvirket, 8 = meget svært påvirket.',
    options: WSAS_OPTS, max: 40,
    // 🔴 ITEMTEKSTEN HERUNDER ER HUSETS EGEN OMSKRIVNING, IKKE WSAS. Maalt 17/8 paa
    // Viktors ordre (»find ud af det«), fire led der peger samme vej:
    //   1. ordlyden findes 0 steder i noter/ soevn/ skemaer/, kun her
    //   2. specen der bestilte bygningen (spec-mct-skema-kadence-2026-05-31.md) naevner
    //      hverken oversaettelse, verbatim eller en dansk kilde for WSAS
    //   3. den kom i 5adb585, samme commit som husets to EGNE skalaer (cas, mcb)
    //   4. item for item mod Mundt et al. (2002): items 2, 3 og 4 har MISTET originalens
    //      opremsninger, item 1 har FAAET »studie/daglige hovedbeskaeftigelse« som ikke
    //      staar der, og item 5 er INDSNAEVRET (originalen siger »others, including those
    //      I live with«, ikke familie og parforhold). Rammen er ogsaa skrevet om.
    // ⇒ Det er ikke en oversaettelse. Det er husets egen skala i WSAS' navn, med WSAS'
    // scoring og WSAS' maksimum. Samme figur som `cas` og `mcb` laengere oppe i filen.
    // 🔴 KONSEKVENS, og fidelity er dyrere end licensen: ISI-agtige skaeringspunkter og
    // funktionsbaand fra det VALIDEREDE instrument gaelder IKKE disse items. Den danske
    // valideringsstudie (Hovmand et al. 2024) har skaeringspunkt 23; brugt her ville det
    // vaere et tal der ser validt ud og ikke er det. Og spec §2b goer WSAS baerende i
    // Prescriba-genansoegningen, saa eksponeringen er payer-vendt og ikke kun klinisk.
    // Teksten er IKKE roert: det er en klinisk og produktmaessig beslutning. Fuld
    // udredning med tabellen: registrets §3l.3d + §3l.3e.
    //
    // 🔴 ATTRIBUTIONEN RETTET 17/8. Stod som »Reproduced with kind permission of Professor
    // Isaac Marks«. Den blev IKKE opfundet her: spec §7.5 konkluderede 31/5 at WSAS var
    // »frit m.« praecis den formulering. Men en tilladelses-formulering fra en ANDEN
    // udgivelse kan ikke baeres med over, og maalt 17/8 findes der intet
    // tilladelses-artefakt i huset (ingen PDF, ingen svar, ingen raekke), og anmodningen
    // fra 27/6 blev aldrig sendt.
    // ⇒ Saetningen laeste som en paastand om en TREDJEPARTS SAMTYKKE, vist til klienter,
    // som ingen kunne belaegge. En manglende notits er et hul; en urigtig er en oplysning.
    // Erstattet af artiklens egen copyright-erklaering, som KAN belaegges.
    // 🔴 ATTRIBUTIONEN ER SKIFTET IGEN, 20-08, og det er anden gang paa tre dage.
    // 17/8 gik den fra en UBELAGT tilladelses-paastand (»Reproduced with kind permission of
    // Professor Isaac Marks«) til artiklens egen copyright-erklaering, som KAN belaegges.
    // Den rettelse var rigtig og loeste det forkerte problem: linjen satte stadig en
    // tredjeparts copyright under tekst han ikke har skrevet, og den blev VIST TIL KLIENTEN
    // (index.html:1377 rendrer s.attribution paa skemakortet).
    // ⇒ Linjen krediterer nu idéen, siger at ordlyden er vores, og siger at skalaen ikke er
    // valideret. Alle tre led er sande og kan belaegges. Kreditering af idéen selv om intet
    // kraever det: Viktor-direktiv 18/8.
    attribution: 'Mycels egen skala. Ordlyden er vores, inspireret af tanken bag Work and Social Adjustment Scale (Mundt et al., 2002). Ikke et valideret instrument.',
    items: [
      'Mit arbejde (eller studie/daglige hovedbeskæftigelse)',
      'Husholdning og praktiske opgaver i hjemmet',
      'Sociale fritidsaktiviteter (sammen med andre)',
      'Private fritidsaktiviteter (alene)',
      'Nære relationer (familie og parforhold)',
    ],
  },
  // ── Alliance (frit/public domain, alliance-checkpoints) ────────────────
  waisr: {
    id: 'waisr', kind: 'radio', title: 'WAI-SR', short: 'Samarbejde', icon: 'samarbejde', badge: '12 spørgsmål',
    instruction: 'Nedenstående udsagn beskriver, hvordan man kan opleve samarbejdet med sin psykolog. Tænk på jeres seneste samtale, når du svarer.',
    options: WAISR_OPTS, max: 72,
    items: [
      'Psykologen og jeg er enige om, hvad der er vigtigt for mig at arbejde med',
      'Det vi foretager os i behandlingen, giver mig en ny måde at se mit problem på',
      'Jeg tror på, at psykologen kan hjælpe mig',
      'Psykologen og jeg er enige om, hvad der skal til for, at min situation kan forbedres',
      'Jeg tror på, at det vi laver, vil hjælpe mig med at nå mine mål',
      'Psykologen og jeg har en god forståelse af, hvilke mål vi arbejder hen imod',
      'Jeg har respekt for og tillid til psykologen',
      'Vi har en god forståelse af den slags forandringer, der ville være gode for mig',
      'Psykologen og jeg samarbejder om at opstille mål for min behandling',
      'Psykologen udviser omsorg for mig, også når jeg gør ting, som vedkommende ikke kan lide',
      'Psykologen og jeg stoler på hinanden',
      'Vi er enige om de ting, jeg skal gøre i behandlingen',
    ],
  },
};

// ════════════════════════════════════════════════════════════════════════
//  SØVNDAGBOG - udskifteligt indholds-modul (B5 swap-arkitektur)
// ════════════════════════════════════════════════════════════════════════
// DROP-IN-KONTRAKT: dette objekt er CSD-INDHOLDET (felt-listen) holdt ISOLERET
// fra render-motoren (renderDiary i index.html) + krypto/akkumulering. En
// egen-forfattet variant til Companion-distribution kan erstatte HELE
// `CSD_SOEVNDAGBOG` med samme `{kind:'diary', fields:[…]}`-shape uden at røre
// render/krypto/persistens. Felt-`kind` (time|number|scale|text) er det eneste
// render-motoren kender → indholdet er frit udskifteligt.
//
// NU (Viktors egen praksis): ÆGTE Consensus Sleep Diary (Carney et al. 2012,
// SLEEP 35(2):287-302 - "The Consensus Sleep Diary: Standardizing prospective
// sleep self-monitoring"). Fri klinisk brug. Gengivet uændret med kildeangivelse.
// Felterne følger CSD-M (morgen-versionen): udfyldes om morgenen for natten der gik.
// ════════════════════════════════════════════════════════════════════════
//  M1.6 · SRT-safety-copy (Viktor-låst verbatim)
// ════════════════════════════════════════════════════════════════════════
// Single-source-of-truth = SoevnKlientTekstLaas.swift (PsykologInvitation,
// Viktor-låst verbatim @aa8e47a) + srt-klient-tekst-laas-2026-06-02.md.
// Gengivet ORDRET her (web kan ikke importere Swift). 0 em-dash, æøå.
// RØR ALDRIG ordlyden uden at opdatere Swift-single-source + lås-tests FØRST.
export const SOEVN_F1 = {
  titel:   'Søvnighed i dag',
  prompt:  'Hvor søvnig har du følt dig i løbet af dagen i dag? Tænk på, hvor tæt du har været på at døse hen eller falde i søvn, mens du var i gang med noget.',
  anker0:  'slet ikke søvnig, klar og vågen hele dagen',
  anker10: 'ekstremt søvnig, kæmpede for at holde mig vågen',
};

// F2 "Sikkerhed i dag" (LÅST verbatim, Viktor 4/6: 6 beslutninger) + Tekst 4
// SM3-failsafe (LÅST verbatim, Viktor 2/6). Klient-rejst safety-flag; ved "Ja"
// vises Tekst 4 uændret + "Skriv til Viktor"-knap. Eksport-nøgler incidentFlag
// (bool) + incidentNote (valgfri fritekst) = M1.3-kontrakt, additiv/bagudkompat.
export const SOEVN_F2 = {
  titel:       'Sikkerhed i dag',
  prompt:      'Var du i dag tæt på en ulykke på grund af træthed, eller faldt du i søvn et sted, hvor det kunne være farligt (fx bag rattet, ved en maskine)?',
  placeholder: 'Du behøver ikke skrive noget, men hvis du vil, kan du fortælle kort, hvad der skete.',
  mikro:       'Det her er ikke noget, du kan svare forkert på. Vælger du "Ja", hører jeg det med det samme, og vi finder ud af det sammen.',
  failsafe:
`**Tak fordi du fortæller mig det.**
Din krop er for søvnig lige nu til, at det er sikkert at fortsætte med det stramme søvnvindue. Det er ikke noget, du har gjort forkert. Vi justerer.
Gør det her nu:
- Sov efter dine vante tider i nat. Læg dig, når du plejer, og bliv i sengen, så længe du har brug for.
- Lad være med at køre bil eller betjene maskiner, før du føler dig udhvilet.
- Skriv til mig hurtigst muligt, så finder vi den rigtige justering sammen.`,
  knap:        'Skriv til Viktor',
};

export const CSD_SOEVNDAGBOG = {
  id: 'soevndagbog', kind: 'diary', title: 'Søvndagbog', short: 'Søvndagbog', icon: 'maane',
  badge: 'én gang om morgenen',
  attribution: 'Consensus Sleep Diary (Carney et al., 2012, SLEEP). Gengivet uændret med kildeangivelse.',
  instruction: 'Udfyld om morgenen for natten, der lige er gået. Svar så godt du kan. Du behøver ikke kigge på uret om natten, et skøn er fint. Der er ingen rigtige eller forkerte svar.',
  fields: [
    { key: 'bedtime',         kind: 'time',   text: 'Hvad tid gik du i seng i aftes?' },
    { key: 'lightsOut',       kind: 'time',   text: 'Hvad tid forsøgte du at falde i søvn (slukkede lyset)?',
      hint: 'Tit samme tid som du gik i seng, men hvis du lå og læste eller var på mobilen lidt først, så skriv hvornår du faktisk prøvede at sove. Samme tid er helt fint.' },
    { key: 'sleepLatencyMin', kind: 'number', text: 'Hvor lang tid tog det dig at falde i søvn?', unit: 'minutter', min: 0, max: 600 },
    { key: 'awakeningsCount', kind: 'number', text: 'Hvor mange gange vågnede du i løbet af natten (ud over den endelige opvågning)?', unit: 'gange', min: 0, max: 30 },
    { key: 'awakeningsMin',   kind: 'number', text: 'Hvor længe var du vågen i alt under disse opvågninger?', unit: 'minutter', min: 0, max: 600 },
    { key: 'finalAwake',      kind: 'time',   text: 'Hvad tid vågnede du endeligt?' },
    { key: 'outOfBed',        kind: 'time',   text: 'Hvad tid stod du op af sengen?' },
    { key: 'quality',         kind: 'scale',  text: 'Hvordan vil du vurdere kvaliteten af din søvn?',
      scale: ['Meget dårlig', 'Dårlig', 'Nogenlunde', 'God', 'Meget god'] },
    // Ingen `default` - et felt må ALDRIG bære en committed default der tæller som
    // svar (spec-ux-soevndagbog-udfyldning §1: fantom-defaults korrumperer kliniske
    // data). Tomt = ubesvaret. Det eneste der må forudfylde er "Samme som i går".
    { key: 'naps',            kind: 'text',   text: 'Tog du dig en lur eller blund i løbet af gårsdagen? (antal og samlet varighed, valgfrit)', optional: true },
    { key: 'substans',        kind: 'substans', ramme: 'igaar', text: 'Tog du søvnmedicin, alkohol eller koffein i går?', optional: true },
    // ── M1.6/M1.3 additive SRT-safety-felter (srtOnly: vises KUN i SRT-mode; ──
    // baseline-stien uden SRT-params er urørt). Ingen `default` (fantom-default-
    // reglen). Eksport-nøgler flyder additivt gennem buildPayloadCSD FIELD_KEYS.
    // F1: 0-10 NRS efter CSD-items (VORES A4-konstrukt, ikke en del af CSD).
    // Dagligt i uge 1 (tn=0), derefter ugentligt (weekOneDaily; safety-spec §2).
    // INGEN tal-/score-feedback til klienten (scoren går kun til motor+Viktor).
    { key: 'daytimeSleepiness_0_10', kind: 'nrs', srtOnly: true, weekOneDaily: true,
      titel: SOEVN_F1.titel, text: SOEVN_F1.prompt,
      anker0: SOEVN_F1.anker0, anker10: SOEVN_F1.anker10, min: 0, max: 10 },
    // F2: klient-rejst safety-flag (SM3-trigger). Ved "Ja": valgfri fritekst +
    // Tekst 4-failsafe-reveal + "Skriv til Viktor". incidentNote renderes AF
    // safety-sektionen (kind 'safetyNote' renderer intet selv).
    { key: 'incidentFlag', kind: 'safety', srtOnly: true,
      titel: SOEVN_F2.titel, text: SOEVN_F2.prompt },
    { key: 'incidentNote', kind: 'safetyNote', srtOnly: true, optional: true, text: '' },
  ],
};

// Registrér søvndagbogen i SKEMAER (men IKKE i SKEMA_ORDER - den er en
// standalone monitorerings-dagbog, aldrig en del af det booking-koblede
// spørgeskema-batteri).
SKEMAER.soevndagbog = CSD_SOEVNDAGBOG;

// ════════════════════════════════════════════════════════════════════════
//  M1.6 · SRT ordinations-vindue (kind:'srtVindue') · EGEN visning FØR dagbog
// ════════════════════════════════════════════════════════════════════════
// Tekst 1/2/3 (Viktor-låst verbatim, em-dash-fri re-lås 26/6) + GK4 (blød
// compression-vinduestekst, låst 3/6, bruges når mode=kompression). Klokkeslæt
// ({sengetid}/{opvågning}) afledes ved render af tib/wake; INTET SE-tal i copy.
export const SRT_VINDUE_TEKST = {
  vindue:
`**Dit søvnvindue**
Dit søvnvindue er den periode, du må være i sengen lige nu: fra **{sengetid}** til **{opvågning}**. Det kan føles kortere, end du er vant til. Det er meningen. Ved at samle din søvn i et fast vindue hjælper vi din krop med at sove mere sammenhængende. Stå op på det faste tidspunkt hver morgen, også i weekenden. Vi justerer vinduet undervejs ud fra din dagbog.`,
  scRegler:
`**Sådan bruger du sengen**
- Gå kun i seng, når du er søvnig.
- Brug kun sengen til søvn (og sex), ikke til at ligge vågen, se skærm eller bekymre dig.
- **Forlad sengen, hvis du føler dig vågen eller frustreret, uden at kigge på uret.** Gå ind i et andet rum, og gå tilbage til sengen, når du føler dig søvnig nok til at falde i søvn.
- Stå op på det samme tidspunkt hver morgen.
- Undgå at sove eller blunde i løbet af dagen.`,
  koerselsAdvarsel:
`**Vigtigt om sikkerhed den første uge**
Den første uge med dit nye søvnvindue kan gøre dig lidt mere træt om dagen, mens din krop vænner sig til det. Hvis du mærker øget træthed, så **undgå aktiviteter, hvor søvnighed kan være farlig for dig, for eksempel at køre langt eller betjene farlige maskiner.** Er du fortsat meget træt i dagtimerne efter den første uge, så sig til, så har vi sandsynligvis sat vinduet for stramt, og vi justerer det.`,
  gk4:
`**Introduktion**
De næste uger justerer vi langsomt den tid, du er i sengen, så den kommer til at passe bedre til den søvn, din krop faktisk bruger. Vi går forsigtigt, et lille skridt ad gangen, så det ikke bliver hårdt undervejs.
**Det ugentlige vindue**
Du får et tidsrum at sove i, som vi strammer en lille smule hver uge. Følg det så godt du kan, læg dig og stå op inden for det. Det kan føles uvant i starten, men det er sådan, søvnen samler sig igen.
Vi finjusterer sammen undervejs ud fra, hvordan det går for dig. Det skal ikke være ubehageligt, mærker du, at det bliver for hårdt, så sig til, så tilpasser vi.`,
};
export const SRT_VINDUE = {
  id: 'soevnvindue', kind: 'srtVindue', title: 'Dit søvnvindue', short: 'Søvnvindue',
  icon: 'seng', tekst: SRT_VINDUE_TEKST,
};
SKEMAER.soevnvindue = SRT_VINDUE;

// ════════════════════════════════════════════════════════════════════════
//  Feature B · Nudge-kort i soevndagbogen (spec 2026-07-23, Viktor-godkendt)
//  Tekster = GODKENDTE UDKAST; Viktor laaser verbatim foer deploy (spec §8).
//  Max ét kort. Prioritet A/B > E > F > D > C. Aldrig blokere send.
// ════════════════════════════════════════════════════════════════════════
export const NUDGE_KORT_VERSION = 'v1';
export const NUDGE_KORT_TEKST = {
  A: { titel: 'Et blik på dit søvnvindue',
    tekst: 'Du blev i sengen lidt længere i morges end dit vindue. Det sker for de fleste undervejs, og en enkelt morgen vælter ingenting. Det faste opståningstidspunkt er det vigtigste enkelte greb i behandlingen, så prøv i morgen at stå op til tiden, også hvis natten var dårlig. Vi justerer vinduet sammen ud fra din dagbog.' },
  B: { titel: 'Et blik på dit søvnvindue',
    tekst: 'Du gik i seng lidt før dit vindue åbnede i aftes. Det er helt forståeligt når man er træt. Men tiden i sengen før vinduet gør typisk søvnen mere opbrudt, ikke længere. Vent til vinduet åbner, og gå først i seng når du er søvnig. Det er sådan søvnen samler sig.' },
  C: { titel: 'Du holdt dit søvnvindue i nat',
    tekst: 'Flot. Det er præcis sådan din søvn får lov at samle sig. Fortsæt på samme måde, så følger vi udviklingen i din dagbog.' },
  D: { titel: 'Hvis du ligger vågen',
    tekst: 'Du lå vågen et stykke tid i nat. Husk at du gerne må forlade sengen når du føler dig vågen eller frustreret, uden at kigge på uret. Gå ind i et andet rum, og gå tilbage når du er søvnig nok til at falde i søvn. Det lyder bagvendt, men det træner hjernen til at forbinde sengen med søvn.' },
  E: { titel: 'Den første tid er den sværeste',
    tekst: 'Du vurderede din søvn som dårlig i nat. I den første uge med søvnvinduet er det helt forventeligt, og det betyder ikke at behandlingen ikke virker. Tværtimod er det tit et tegn på at søvntrykket er ved at bygge sig op. For de fleste begynder søvnen at samle sig i løbet af de næste uger. Hold fast, og skriv til mig hvis det føles for hårdt.' },
  F: { titel: 'Om alkohol og søvn',
    tekst: 'Du noterede alkohol i går. Det er din dagbog, og ærlige svar er præcis det der gør den nyttig. Bare så du ved det: alkohol kan godt hjælpe med at falde i søvn, men den gør typisk søvnen mere opbrudt senere på natten. Hvis du vil give søvnvinduet de bedste betingelser, gør det en forskel at holde igen, især de sidste timer før sengetid.' },
};

// "HH:MM" -> minutter siden midnat, ellers null.
function nudgeMin(t) {
  if (typeof t !== 'string' || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Vaelg hoejst ét kort. entry = raa dagbogs-entry, ctx = {tibOrd, wakeOrd, tn, nudgeFra}.
// Score-laas: daytimeSleepiness_0_10 laeses ALDRIG her (spec §2.4).
export function vaelgNudgeKort(entry, ctx) {
  if (!entry || !ctx || ctx.nudgeFra) return null;
  const tibOrd = (typeof ctx.tibOrd === 'number' && isFinite(ctx.tibOrd)) ? ctx.tibOrd : null;
  const wakeOrd = nudgeMin(ctx.wakeOrd);
  const bed = nudgeMin(entry.bedtime);
  const out = nudgeMin(entry.outOfBed);
  if (tibOrd == null || wakeOrd == null || bed == null || out == null) return null;

  const G = 30;
  const outN = out < bed ? out + 1440 : out;         // midnats-kryds
  const tibFaktisk = outN - bed;
  const vinduesstart = ((wakeOrd - tibOrd) % 1440 + 1440) % 1440;
  // Afstande maalt cirkulaert med retning: positiv = senere end referencen.
  const outAfvig = ((out - wakeOrd + 1440 + 720) % 1440) - 720;      // [-720, 720)
  const bedAfvig = ((bed - vinduesstart + 1440 + 720) % 1440) - 720;

  const glidning = tibFaktisk > tibOrd + G;
  const byg = (id) => ({ id, titel: NUDGE_KORT_TEKST[id].titel,
    tekst: NUDGE_KORT_TEKST[id].tekst, tekstVersion: NUDGE_KORT_VERSION });

  if (glidning && outAfvig > G) return byg('A');
  if (glidning && bedAfvig < -G) return byg('B');
  if (glidning) return null;                          // glidning uden klar retning: intet kort

  // Dagbogen GEMMER quality som tal 1-5 (idx+1: 1=Meget dårlig, 2=Dårlig, ... index.html scale-felt).
  // Accepterer BÅDE tal (produktion) og streng (defensivt/legacy) — ellers matcher tal aldrig en streng
  // og kort E kan aldrig fyre for en rigtig klient.
  const kvalitet = entry.quality;
  const daarligSoevn = kvalitet === 1 || kvalitet === 2
    || kvalitet === 'Meget dårlig' || kvalitet === 'Dårlig';
  if (ctx.tn === 0 && daarligSoevn) return byg('E');

  const sb = entry.substans;
  if (sb && sb.intet !== true && Array.isArray(sb.alkohol) && sb.alkohol.length) return byg('F');

  const lat = entry.sleepLatencyMin, wake = entry.awakeningsMin;
  const holdt = tibFaktisk <= tibOrd + G && outAfvig <= G;
  if (holdt && typeof lat === 'number' && typeof wake === 'number' && lat + wake >= 60) return byg('D');

  if (holdt) return byg('C');
  return null;
}

// ── Ugentligt refleksions-kort (mønster over ugens 7 nætter) ────────────────
// Laeser KUN gemte nudgeKort.id (SRT-firewall: daytimeSleepiness roeres ALDRIG).
// Verbatim godkendt af Viktor 23/7 (spec §5). Em-/en-dash-fri.
export const UGE_KORT_TEKST = {
  fejring: {
    titel: 'Stærk uge',
    tekst: 'Du holdt dit søvnvindue de fleste nætter i denne uge. Det er præcis sådan søvnen får lov at falde til ro. Bliv ved.',
  },
  fokus: {
    titel: 'Et blik på ugen',
    // {udfordring} + {n} indsaettes af vaelgUgeKort.
    tekst: 'Du har fulgt din dagbog i denne uge, og det tæller. Det der fyldte mest var {udfordring}, {n} nætter. Det er et helt almindeligt sted at starte, og det tager vi sammen.',
  },
  opmuntring: {
    titel: 'Du er i gang',
    tekst: 'Du er godt i gang med at bygge vanen. Bliv ved, så tegner mønsteret sig, og vi ser det sammen.',
  },
};
export const UGE_UDFORDRING_FRASE = {
  A: 'at komme for sent op af sengen',
  B: 'at gå tidligt i seng',
  D: 'at ligge vågen om natten',
  F: 'alkohol tæt på sengetid',
};

// ugeEntries = ugens (op til 7) entries. Returnerer ét ugekort eller null.
export function vaelgUgeKort(ugeEntries) {
  if (!Array.isArray(ugeEntries)) return null;
  const entries = ugeEntries.filter(e => e && typeof e === 'object');
  if (entries.length < 4) return null;                        // defensivt gulv (spec §4.0)
  const tally = {};
  for (const e of entries) {
    const id = e.nudgeKort && e.nudgeKort.id;
    if (id) tally[id] = (tally[id] || 0) + 1;
  }
  const holdt = (tally.C || 0) + (tally.E || 0);              // vindue-troskab (spec §3)
  const byg = (variant, tekst) => ({
    id: 'UGE', variant,
    titel: UGE_KORT_TEKST[variant].titel,
    tekst: tekst || UGE_KORT_TEKST[variant].tekst,
    tekstVersion: NUDGE_KORT_VERSION,
  });
  // 1. Fejring: holdt-vindue >= 5.
  if (holdt >= 5) return byg('fejring');
  // 2. Stoettende fokus: dominerende udfordring >= 3; uafgjort -> prioritet A>B>D>F.
  const PRIORITET = ['A', 'B', 'D', 'F'];
  let bedst = null;
  for (const id of PRIORITET) {
    const antal = tally[id] || 0;
    if (antal >= 3 && (bedst === null || antal > bedst.antal)) bedst = { id, antal };
  }
  if (bedst) {
    const tekst = UGE_KORT_TEKST.fokus.tekst
      .replace('{udfordring}', UGE_UDFORDRING_FRASE[bedst.id])
      .replace('{n}', String(bedst.antal));
    return byg('fokus', tekst);
  }
  // 3. Blid opmuntring.
  return byg('opmuntring');
}

// Mikro-probe (spec §7): vises efter 7. og 21. gemte udfyldning, kun hvis mindst
// ét kort er set. Valgfri, blokerer aldrig send.
export const NUDGE_EVAL_MILEPAELE = [7, 21];
export const NUDGE_EVAL_SVAR = ['Ja, de hjælper mig', 'Både og',
  'Nej, jeg springer dem over', 'De forstyrrer mig'];
export const NUDGE_EVAL_TEKST = {
  spm1: 'Undervejs har du set små kort om dit søvnvindue. Har de været en hjælp?',
  spm2: 'Er der noget ved kortene vi skal gøre anderledes? (valgfrit)',
};

// ════════════════════════════════════════════════════════════════════════
//  SØVN-BASELINE - engangs intake-skema (IKKE-akkumulerende)
// ════════════════════════════════════════════════════════════════════════
// Adskilt fra den daglige CSD: sendes ÉN gang ved forløbs-start, udfyldes én
// gang, deles én gang. KUN deskriptive/kontekst-variable (data-minimering,
// GDPR) - hver variabel ændrer en klinisk beslutning (spec-baseline-intake §1).
// D3-SIKKERHEDSSCREEN (epilepsi/bipolar/OSA/suicidalitet/…) er BEVIDST IKKE her:
// den hører i Viktors kliniske intake (B-Q1/Riemann "clinical interview"), ikke
// et self-serve-link. Nul-score: ingen tolkning vises klienten.
export const SOEVN_BASELINE = {
  id: 'soevn-baseline', kind: 'baseline', title: 'Kort baseline om din søvn', short: 'Baseline', icon: 'maane',
  badge: 'udfyldes én gang',
  instruction: 'Et kort engangsskema om din søvn og dine vaner. Det hjælper din psykolog med at tilpasse forløbet til dig. Der er ingen rigtige eller forkerte svar.',
  // 🔴 ALDER + KOEN ER FJERNET HERFRA (Viktor-GO 14/8, spm. 10). De stod ogsaa i
  // SOEVN-SCREENINGEN (l.622 + l.630 foer denne aendring), og de to skemaer sendes i SAMME
  // opstarts-SMS, saa klienten blev spurgt om det samme to gange.
  // FLIP  vender HVIS nogen laeser baseline.alder / baseline.koen STRUKTURERET i Mentem
  // MAALT grep paa baselineSvar|SoevnBaselineIngest x alder|koen i PsykologInvitation -> 0
  //       POS-KTRL alderOver50|alderVedForloebsstart -> 45 (naalen KAN se en laeser)
  //       NEG-KTRL zzqxqAlder -> 0.  SoevnBaselineImport laeser kun categories/baseline/
  //       baselineType/token, altsaa ingen felt-noegler overhovedet.
  // 🔴 SCREENINGENS egne alder+koen er UROERLIGE: de fodrer stopBang.alderOver50,
  //    stopBang.koenMand og SoevnKlinikerPref.alderVedForloebsstart, og dermed exit-gatens
  //    aldersnorm (ratificeret 12/8). Fjernes de DER, er det en klinisk regression.
  // 🟡 GRAENSEN SKREVET UD: baseline kan sendes ALENE (raekke-bundne gensend paa et
  //    eksisterende forloeb). En klient der KUN faar baseline, bliver derefter ikke spurgt
  //    om alder og koen noget sted. Det er en vurdering, ikke en maaling.
  fields: [
    { key: 'undertype',        kind: 'radio',  text: 'Hvad passer bedst på dine søvnvanskeligheder?',
      options: ['Svært ved at falde i søvn i starten af natten', 'Vågner meget i løbet af natten', 'Vågner for tidligt om morgenen', 'En blanding'] },
    { key: 'varighed',         kind: 'radio',  text: 'Hvor længe har du haft søvnvanskeligheder?',
      options: ['Under 3 måneder', '3 måneder eller mere'] },
    { key: 'substans',         kind: 'substans', ramme: 'vanligt', text: 'Dit vanlige mønster: søvnmedicin, alkohol eller koffein?', optional: true },
    { key: 'lure',             kind: 'radio',  text: 'Tager du dig lure i dagtimerne?',
      options: ['Nej', 'Ja, under 30 min', 'Ja, 30-60 min', 'Ja, over 60 min'] },
    { key: 'vanligOpvaagning', kind: 'time',   text: 'Hvad tid står du normalt op om morgenen?' },
  ],
};
SKEMAER['soevn-baseline'] = SOEVN_BASELINE;

// ════════════════════════════════════════════════════════════════════════
//  SØVN-SCREENING — klient-selvrapport-delen af sikkerhedsscreeningen (Fase C §3a)
// ════════════════════════════════════════════════════════════════════════
// SPLIT (Viktor-direktiv 2/7): klienten udfylder SELV anamnese-items + STOP-Bang
// som selvrapport; kliniker-delen (Viktors vurdering + GRØN/GUL/RØD) bor i Mentem.
// Suicidalitets-itemet FORBLIVER kliniker-side og indgår ALDRIG her (art30-enheds-
// flow §c: følsom sikkerhedsscreen holdes ude af self-serve-skemaet).
//
// PAYLOAD-KONTRAKT (autoritativ Swift-side: SoevnOpstart.swift SoevnKlientScreeningSvar
// + SoevnScreeningIngest.parse; facit-test SoevnFaseCTests.testScreeningSvarPayloadRoundtrip):
//   data.screeningSvar = {
//     stopBang: { snorken, observeretApnoe, dagtraethed, hypertension, bmiOver35,
//                 alderOver50, halsomfangOver40 (bool|null = "ved ikke"), koenMand },
//     kontraindikationer: [SoevnKontraindikation-rawValues med JA-svar],
//     alder (heltal, klientens alder ved forløbsstart; se ALDER nedenfor),
//     fritekst (valgfri streng, udelades når tom),
//   }
//
// ALDER (Viktor-svar 12/8, valg 1: »det skal være i det spørgeskema som klienter udfylder
// når de starter med søvnbehandling«). Klienten oplyser sin ALDER som et tal, og
// stopBang.alderOver50 AFLEDES af den (alder > 50), nøjagtig samme mønster som Æ2's
// koen → koenMand. Wire-formen på stopBang er derfor UÆNDRET (samme 8 felter, samme
// rækkefølge); alderen kommer som et NYT søskende-felt ved siden af stopBang.
// 🔵 HVORFOR ET TAL FREM FOR ET JA/NEJ MERE: Mentems exit-gate (Soevnberegning.exitGate)
// skifter søvnnorm ved 65 år, ikke ved 50, og på ægte data VENDER den dom (alder 40 =
// opfyldt, alder 70 = ikke opfyldt på uændrede tal). Et »over 50«-svar kan ikke svare på
// et 65-skel. Ét tal svarer på begge, så klienten får ikke ét spørgsmål mere - han får
// det samme spørgsmål stillet så det kan bruges. Aldrig fødselsdato (dataminimering).
// Item-keys er WIRE-VÆRDIER (Swift-enum-rawValues / STOPBang-felter) — RØR DEM ALDRIG.
// Klinisk kilde: soevn/screening-tjekliste-ordlyd-2026-06-01.md (Del A + STOP-Bang, Chung 2008).
//
// KLIENT-COPY = UDKAST (omskrivning af tjeklistens kliniker-ordlyd til klient-sprog).
// Viktor-ratificeres ord-for-ord FØR ship (batch §3a); nudansk, æøå, 0 em-dash.
export const SOEVN_SCREENING = {
  id: 'soevn-screening', kind: 'screening', title: 'Kort oplysningsskema', short: 'Oplysningsskema',
  badge: 'udfyldes én gang',
  instruction: 'Et kort skema om din søvn og dit helbred. Dine svar hjælper din psykolog med at vælge den fremgangsmåde, der er tryg for dig. Svar så godt du kan. Er du i tvivl om et svar, så svar ja, og skriv gerne mere i tekstfeltet til sidst. Der er ingen rigtige eller forkerte svar.',
  // Anamnese-items (ja/nej). key = SoevnKontraindikation.rawValue (wire-kontrakt).
  kontraStem: 'Om dit helbred og din hverdag',
  kontraItems: [
    { key: 'bipolarMani', text: 'Har du bipolar lidelse, eller har du haft en periode med mani eller hypomani (unormalt opstemt eller opkørt, med meget lidt behov for søvn)?' },
    { key: 'epilepsiAnfald', text: 'Har du epilepsi eller en anden lidelse med anfald?' },
    { key: 'parasomnier', text: 'Går du i søvne, har du natteskræk, eller sker det, at du råber, slår eller sparker i søvne?' },
    { key: 'betydeligFaldrisiko', text: 'Har du let ved at falde, eller er du usikker på benene, fx når du står op om natten?' },
    { key: 'erhvervschauffoer', text: 'Kører du bil, bus eller lastbil i dit arbejde, eller har du andet arbejde, hvor et øjebliks uopmærksomhed kan være farligt?' },
    { key: 'natarbejde', text: 'Arbejder du om natten eller i skiftende vagter?' },
  ],
  // STOP-Bang-selvrapport (Chung 2008). key = STOPBang-feltnavn (wire-kontrakt).
  // halsomfangOver40 er VALGFRI viden: "Ved ikke" = null (tæller ALDRIG som nej i scoren).
  stopBangStem: 'Om din søvn og din krop',
  stopBangItems: [
    { key: 'snorken', text: 'Snorker du højlydt? (fx så det kan høres gennem en lukket dør, eller så din partner har bemærket det)' },
    { key: 'observeretApnoe', text: 'Har nogen set dig holde pauser i vejrtrækningen, mens du sover?' },
    { key: 'dagtraethed', text: 'Føler du dig ofte træt, udmattet eller søvnig i dagtimerne?' },
    { key: 'hypertension', text: 'Har du forhøjet blodtryk, eller er du i behandling for det?' },
    // Æ1 (Viktor-GO 2/7): indbygget valgfri BMI-beregner — klienten skal ikke på nettet.
    // HÅRDT dataminimerings-krav: højde/vægt/BMI-værdien forbliver LOKALE i browseren
    // (lever kun i beregner-UI'ens felter) og indgår ALDRIG i payloaden; kun ja/nej sendes.
    { key: 'bmiOver35', text: 'Er dit BMI over 35?', bmiBeregner: true,
      hint: 'BMI er din vægt set i forhold til din højde. Er du i tvivl, kan du beregne det lige her. Du kan også bare svare selv.',
      beregner: {
        knap: 'Beregn mit BMI (valgfrit)',
        hoejdeLabel: 'Højde', hoejdeUnit: 'cm',
        vaegtLabel: 'Vægt', vaegtUnit: 'kg',
        privatliv: 'Højde og vægt bliver på din enhed og sendes ikke til nogen.',
      } },
    // Alder som TAL (Viktor-svar 12/8): STOP-Bang-booleanen alderOver50 afledes af tallet
    // og bliver stående på sin plads i wire-rækkefølgen (`afledt` sætter den her i loopet).
    { key: 'alder', text: 'Hvor gammel er du?', talFelt: { unit: 'år', label: 'Alder' },
      afledt: { key: 'alderOver50', over: 50 },
      hint: 'Skriv hvor mange år du er fyldt.' },
    { key: 'halsomfangOver40', text: 'Er dit halsomfang mere end 40 cm?', vedIkke: true, hint: 'Mål eventuelt med et målebånd rundt om halsen. Ved du det ikke, vælger du bare Ved ikke.' },
    // Æ2 (Viktor-ratificeret 2/7): køns-spørgsmål erstatter "Er du en mand?". Wire =
    // screeningSvar.koen (mand/kvinde/andet) + AFLEDT stopBang.koenMand (mand=ja,
    // kvinde/andet=nej). "Andet" flages Mentem-side (GUL, klinisk vurdering — scoren
    // antager mand/kvinde). Decoder-tolerance verificeret: koen er String? Mentem-side.
    { key: 'koen', text: 'Hvilket køn er du?', koensValg: true,
      options: [
        { value: 'mand', label: 'Mand' },
        { value: 'kvinde', label: 'Kvinde' },
        { value: 'andet', label: 'Andet' },
      ] },
  ],
  fritekst: { key: 'fritekst', text: 'Er der andet om din søvn eller dit helbred, som din psykolog bør vide?', optional: true },
};
SKEMAER['soevn-screening'] = SOEVN_SCREENING;

// ════════════════════════════════════════════════════════════════════════
//  SCORING (intern - bruges til opaque payload; klienten ser ALDRIG resultatet)
// ════════════════════════════════════════════════════════════════════════
function val(a) { return (a && typeof a === 'object') ? a.value : a; }
function sumSkema(answers, id) {
  const a = answers[id]; if (!a) return null;
  return Object.values(a).reduce((s, x) => s + (Number(val(x)) || 0), 0);
}
function itemsInt(answers, id) {
  const a = answers[id] || {}, out = {};
  for (const k of Object.keys(a)) out['q' + k] = Number(val(a[k])) || 0;
  return out;
}

export function computeScores(answers) {
  const out = {};
  if (answers.phq9)  out.phq9  = { total: sumSkema(answers, 'phq9'),  max: 27 };
  if (answers.gad7)  out.gad7  = { total: sumSkema(answers, 'gad7'),  max: 21 };
  if (answers.who5) { const raw = sumSkema(answers, 'who5'); out.who5 = { total: raw, max: 25, percent: raw * 4 }; }
  if (answers.wsas)  out.wsas  = { total: sumSkema(answers, 'wsas'),  max: 40 };
  if (answers.waisr) out.waisr = { total: sumSkema(answers, 'waisr'), max: 72 };
  if (answers.cas) {
    const c = answers.cas;
    const components = {
      worry: Number(val(c[0])) || 0, rumination: Number(val(c[1])) || 0,
      threat: Number(val(c[2])) || 0, avoidance: Number(val(c[3])) || 0,
    };
    const total = Math.round((components.worry + components.rumination + components.threat + components.avoidance) / 4);
    out.cas = { total, components };
  }
  if (answers.mcb) {
    const m = answers.mcb;
    out.mcb = { ratings: SKEMAER.mcb.items.map((it, i) => ({ key: it.key, rating: Number(val(m[i])) || 0 })) };
  }
  // EMA: samme 0-100 VAS-form som `mcb`, to items. Se `buildPayload` for hvorfor den
  // IKKE lander i `casTrends`.
  if (answers.ema) {
    const e = answers.ema;
    out.ema = { ratings: SKEMAER.ema.items.map((it, i) => ({ key: it.key, rating: Number(val(e[i])) || 0 })) };
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//  AFSENDER-STEMPEL (Viktor-ordre 26/7 punkt 2)
// ════════════════════════════════════════════════════════════════════════
// Hver aflevering baerer HVEM der producerede den: hvilken udrullet web-udgave
// (deploy-sha.txt, samme SHA som deploy-herkomst-gaten stempler) og hvilken
// link-generation klienten kom ind ad (?v= i URL'en).
//
// Hullet det lukker (maalt 26/7): `version`/`schemaVersion` er haardkodede 1-taller i
// alle byggere og har aldrig aendret sig. Da MN's oplysningsskema blev afvist 09:34:13,
// kunne den udgave han faktisk udfyldte KUN udledes af serverlog + kildekode side om side.
//
// 🔴 STEMPLET OPDIGTER ALDRIG. Ukendt herkomst = null, ikke en default. En forkert SHA er
// vaerre end ingen SHA: den ser autoritativ ud i en obduktion. Derfor fail-closed paa alt
// der ikke ER en 40-hex SHA / et positivt heltal - det er samme fejlklasse som app-sidens
// `?? 1`, hvor en antagelse har ligget og lignet en maaling.
let _afsenderKontekst = { webDeploySha: null, linkVersion: null };

function rensDeploySha(raa) {
  if (typeof raa !== 'string') return null;
  const s = raa.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(s) ? s : null;      // 404-HTML, afkortet SHA, tom streng => null
}

function rensLinkVersion(raa) {
  if (typeof raa === 'number') return Number.isInteger(raa) && raa > 0 ? raa : null;
  if (typeof raa !== 'string') return null;
  const s = raa.trim();
  if (!/^\d+$/.test(s)) return null;               // "nyeste", "2a", "" => null
  const n = Number(s);
  return n > 0 ? n : null;                         // versioner taelles fra 1
}

/// Saettes EEN gang ved sideindlaesning (index.html), foer nogen payload bygges.
/// `null`/tomt argument nulstiller - saa en side der ikke kunne maale sin herkomst,
/// paastaar ingenting.
export function setAfsenderKontekst(kontekst) {
  const k = kontekst || {};
  _afsenderKontekst = {
    webDeploySha: rensDeploySha(k.webDeploySha),
    linkVersion: rensLinkVersion(k.linkVersion),
  };
}

/// Frisk kopi pr. kald - en bygger maa aldrig kunne mutere husets kontekst.
export function afsenderStempel() { return { ..._afsenderKontekst }; }

// ════════════════════════════════════════════════════════════════════════
//  INGEST-KONVOLUT (transport-form - matcher app IngestKonvolut)
// ════════════════════════════════════════════════════════════════════════
// Producent-side envelope-wrap (PR-2): web emitterer den ÆGTE konvolut-form
// {schemaVersion, schemaType, clientTimestamp, data, clientUA} i stedet for en
// flad payload. Den hidtidige FLADE payload pakkes UÆNDRET i `data` (0 tab).
// App-adapteren (IngestKonvolutAdapter.normalisér) ser dermed `.konvolutDirekte`
// - ingen felt-syntese - mens gamle flade containere fortsat dekoder
// (.fladCSD/.fladBatteri). Felt-kontrakt: IngestEnvelopeDecryptor.swift /
// IngestKonvolutRouter.swift. clientUA='web' = ærlig kanal-markør (kontrakt §6,
// valgfrit) → føder app §8.4-adherence. respondentPseudonym sættes IKKE web-side
// (kommer fra poll-/fil-laget - adapter-note, ikke payload).
// NB: RØR ALDRIG skema-felt-definitionerne (CSD_SOEVNDAGBOG osv.) - kun
// payload-BYGGERNE wrappes (transport-form, ikke skema-felter).
function buildIngestKonvolut(data, { schemaType, schemaVersion, clientTimestamp } = {}) {
  return {
    schemaVersion,
    schemaType,
    clientTimestamp,
    data,
    clientUA: 'web',
  };
}

// ════════════════════════════════════════════════════════════════════════
//  PAYLOAD (TerapiEksportPayload-shape - matcher E2EKryptering.swift)
// ════════════════════════════════════════════════════════════════════════
function isoNoFrac(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

export function buildPayload(answers, meta = {}) {
  const now = isoNoFrac(new Date());
  const sessionNumber = (meta.sessionNumber != null) ? meta.sessionNumber : null;
  const s = computeScores(answers);

  const questionnaireScores = [];
  for (const id of ['gad7', 'phq9', 'who5', 'wsas', 'waisr']) {
    if (!s[id]) continue;
    const sub = itemsInt(answers, id);
    if (id === 'who5') sub.percent = s.who5.percent;
    questionnaireScores.push({
      type: id,
      completedAt: now,
      weekNumber: sessionNumber,
      totalScore: s[id].total,
      subscaleScores: sub,
    });
  }

  const payload = {
    version: 1,
    afsender: afsenderStempel(),
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: Object.keys(answers),
    questionnaireScores,
  };

  // ── Udfyldnings-varighed (Viktor-GO Q15, 23-08-2026) ──────────────────────────────
  // Formen: { who5: 61, wsas: 48, ..., ialt: 446, afbrudt: ['phq9'] }, i HELE SEKUNDER.
  // Måles paa fladen (index.html, `varighedResultat`), ikke her: denne funktion ser kun
  // svarene, og en varighed er en egenskab ved UDFYLDNINGEN, ikke ved svaret.
  //
  // 🔴 FELTET UDELADES HELT NAAR DER INTET ER MAALT, frem for at staa som `null` eller
  //    `{}`. En modtager der taeller »hvor mange besvarelser har en varighed« skal kunne
  //    skelne »ikke maalt« fra »maalt til nul«, og et tomt objekt ligner det sidste.
  //    Det er husets egen regel om at et nul skal sige hvilken slags nul det er.
  // 🟡 GRAENSEN: feltet er adfaerdsmetadata om klienten og har sin egen raekke i
  //    art.30-fortegnelsen, aktivitet 15. Det maa ALDRIG vises pr. klient i journalen,
  //    kun som median paa tvaers og foerst ved n >= 20 pr. skema.
  if (meta.varighed && typeof meta.varighed === 'object' && meta.varighed.ialt != null) {
    payload.varighed = meta.varighed;
  }

  if (s.cas) {
    payload.casTrends = [{
      date: now,
      totalScore: s.cas.total,
      componentScores: s.cas.components,
      intensityRating: s.cas.total,
      durationMinutes: 0,
      dmAttempted: false,
    }];
  }
  if (s.mcb) {
    payload.beliefRatings = s.mcb.ratings.map((r) => ({
      date: now,
      beliefText: SKEMAER.mcb.items.find((it) => it.key === r.key).text,
      category: r.key,
      rating: r.rating,
    }));
  }
  // ── EMA: den momentane serie faar sit EGET felt ─────────────────────────────
  // 🔴 UDEN DEN HER GREN AFLEVERES EN EMA HELT TOM. Maalt 17/8 i `test/e2e-ema.mjs`:
  // afleveringen naaede frem, kadencen taltes ned, klienten fik »sendt sikkert og
  // krypteret« , og `questionnaireScores` var `[]`. `categories` bar navnet `ema`, saa
  // alt SAA rigtigt ud. **En tom aflevering der lykkes, er dyrere end en der fejler:**
  // den bruger klientens svar-oejeblik op og efterlader intet at maale paa, og hverken
  // hun eller psykologen kan se det. Aarsagen er strukturel: `questionnaireScores`-loekken
  // ovenfor har en HAARDKODET liste over fem skemaer, og `cas`/`mcb` fik hver sin gren
  // her nedenfor. `ema` blev routet ind i batteri-flowet med en dispensation, men fik
  // aldrig sin gren , et skema kan altsaa i dag rendres, besvares og sendes uden at
  // nogen af de tre steder baerer dets svar.
  //
  // 🔴 DEN LANDER MED VILJE IKKE I `casTrends`. Den struktur har fire faste komponenter
  // (worry/rumination/threat/avoidance) og et gennemsnit af dem som `totalScore`. EMA har
  // TO items, saa de manglende to skulle udfyldes , og et udfyldt nul er ikke et tomt
  // felt, det er et maalt »slet ingen tid«. To aegte svar paa 70 og 40 ville blive til en
  // CAS-total paa 27 i psykologens forloebskurve. **Et fabrikeret tal er vaerre end intet
  // tal, fordi det er umuligt at skelne fra et maalt**, og det ville netop ske i den serie
  // CAS-1 selv bor i. Egen liste; sammenligningen sker paa NOEGLERNE (`worry` deles med
  // `cas`, `uncontrollability` med `mcb` , se SKEMAER.ema), praecis som beslutningen 16/8
  // sagde: momentan serie ved siden af den ugentlige maaling, uden en oversaettelse.
  if (s.ema) {
    payload.emaRatings = s.ema.ratings.map((r) => ({
      date: now,
      promptText: SKEMAER.ema.items.find((it) => it.key === r.key).text,
      category: r.key,
      rating: r.rating,
    }));
  }
  // Envelope-wrap (PR-2): flad payload UÆNDRET i `data`; konvolut-felter afledt af
  // payloadens egne værdier (categories[0]→schemaType, version→schemaVersion,
  // exportedAt→clientTimestamp). Fallback-schemaType matcher app-adapterens flad-batteri-gren.
  return buildIngestKonvolut(payload, {
    schemaType: payload.categories[0] || 'questionnaire-batteri',
    schemaVersion: payload.version,
    clientTimestamp: payload.exportedAt,
  });
}

// ════════════════════════════════════════════════════════════════════════
//  SØVNDAGBOG-PAYLOAD (akkumuleret periode → ÉN opaque eksport)
// ════════════════════════════════════════════════════════════════════════
// REN data-capture: payloaden bærer KUN de rå dagbogs-felter (ingen scoring,
// ingen TST/SE) - nul-score-invarianten bevares, og den AUTORITATIVE
// TST/SE-beregning sker Mentem-side (Swift `Soevnberegning`), så formlen har
// én sandhedskilde. `sleepDiary` er en NY gren ved siden af questionnaireScores
// /casTrends/beliefRatings; Swift `TerapiEksportPayload` ignorerer ukendte
// felter ved decode → bagudkompatibelt (fuld ingest-persistens = flagget P2-
// schema-touch, ikke Fase 1).
//
// `entries` = array af { date:'YYYY-MM-DD', bedtime, lightsOut, sleepLatencyMin,
//   awakeningsCount, awakeningsMin, finalAwake, outOfBed, quality, naps?, medication? }.
// Versionering (persistens-spec §5/§6, G2). Additivt på formatVersion:1.
export const SCHEMA_VERSION = 1;          // payload-strukturversion
export const CONTENT_VERSION = 1;         // CSD-indholdsversion (bump = kun NYE forløb, G2-frys)
export const PROTOCOL_VERSION = 1;        // draft-store transport-kontrakt
// 🔴 `SITE_BUILD` ER AFSKAFFET (26/7). Den var `'2026-06-01-fase1'` og havde stået uændret
// siden 1. juni, mens den fulgte med i HVER klient-aflevering som `meta.siteBuild`. Den var
// ikke bare forældet — den var den forkerte KLASSE af værdi: et menneske skrev den, så den
// beskrev hvad nogen MENTE den dag, ikke hvad der faktisk KØRTE da klienten trykkede send.
// I en obduktion er det værre end ingenting, for den ser ud som om nogen havde målt.
// `meta.siteBuild` er nu den målte deploy-herkomst (`afsender.webDeploySha`), og ukendt
// herkomst er `null` — vi gætter aldrig en build. Se `afsenderStempel` for fail-closed-reglen.

export function buildPayloadCSD(entries, meta = {}) {
  const now = isoNoFrac(new Date());
  const FIELD_KEYS = CSD_SOEVNDAGBOG.fields.map((f) => f.key);

  const sleepDiary = (entries || []).map((e) => {
    const out = { date: e.date };
    for (const k of FIELD_KEYS) if (e[k] != null && e[k] !== '') out[k] = e[k];
    if (e.nudgeKort !== undefined) out.nudgeKort = e.nudgeKort;   // Feature B: {id, tekstVersion} | null
    // Hvornår den GÆLDENDE udgave blev gemt. Uden den kan psykologen se HVAD der blev
    // rettet, men ikke hvornår, og en rettelse samme morgen er en anden slags hændelse
    // end en rettelse tre dage efter.
    if (e.savedAt) out.savedAt = e.savedAt;
    // 🔴 Rettelses-historik (Viktor 9/8). FIELD_KEYS er en HVIDLISTE, og en hvidliste
    // dropper TAVST det den ikke kender: uden disse linjer ville de udgåede udgaver blive
    // gemt trofast på klientens telefon og forsvinde mellem hendes disk og psykologens
    // skærm. Hver tidligere udgave hvidlistes gennem samme nåleøje som den gældende, så
    // en rettelse ikke kan blive en bagvej for felter der ellers ikke må eksporteres.
    if (Array.isArray(e.tidligere) && e.tidligere.length) {
      out.tidligere = e.tidligere.map((t) => {
        const v = { date: t.date };
        if (t.savedAt) v.savedAt = t.savedAt;
        for (const k of FIELD_KEYS) if (t[k] != null && t[k] !== '') v[k] = t[k];
        if (t.nudgeKort !== undefined) v.nudgeKort = t.nudgeKort;
        return v;
      });
    }
    if (e.tidligereKappet) out.tidligereKappet = e.tidligereKappet;   // aldrig et tavst loft
    return out;
  });

  const startedAt = meta.startedAt || (sleepDiary[0] && sleepDiary[0].date) || now;

  // 🔴 ÉT kald, to felter. `afsender.webDeploySha` og `meta.siteBuild` besvarer SAMME
  // spørgsmål — »hvilken web-udgave producerede denne aflevering?« — og to kald ville
  // gøre det muligt for dem at divergere. Så ved en obduktion ikke hvilket af dem den
  // skal tro på, og et stempel man ikke kan tro på er værre end intet stempel.
  const afsender = afsenderStempel();

  const data = {
    version: 1,
    afsender,
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: ['soevndagbog'],
    diaryType: 'consensus-sleep-diary',
    diaryStartedAt: startedAt,
    plannedDays: (meta.plannedDays != null) ? meta.plannedDays : null,
    // Art.9-samtykke (server-opbevaring) - data-minimalt, INDE i ciphertext.
    // Additivt: ældre containere mangler feltet (=> null), ingen krypto-/format-
    // ændring, ingen migration. Localstorage-variant => null (intet samtykke krævet).
    consent: meta.consent || null,
    nudgeEval: meta.nudgeEval || null,   // Feature B mikro-probe-svar (additivt)
    // Versions-blok (§6) - klartekst INDE i ciphertext (serveren ser den aldrig).
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: (meta.contentVersion != null) ? meta.contentVersion : CONTENT_VERSION,
      instrument: 'CSD-Carney-2012',
      protocolVersion: PROTOCOL_VERSION,
      siteBuild: afsender.webDeploySha,   // MÅLT herkomst (deploy-SHA); null = vi ved det ikke
      forloebId: meta.forloebId || null,          // = token (mapping kun i Mentem)
      periodPlanned: (meta.plannedDays != null) ? meta.plannedDays : null,
      periodCompleted: sleepDiary.length,
      startedAt,
      endedAt: meta.endedAt || null,
    },
    sleepDiary,
  };

  // Envelope-wrap (PR-2): flad CSD-payload UÆNDRET i `data`; konvolut-felter afledt
  // (categories[0]→schemaType, meta.schemaVersion→schemaVersion, exportedAt→clientTimestamp).
  return buildIngestKonvolut(data, {
    schemaType: data.categories[0],
    schemaVersion: data.meta.schemaVersion,
    clientTimestamp: data.exportedAt,
  });
}

// ════════════════════════════════════════════════════════════════════════
//  DRAFT-MERGE (newest-wins pr. entry-dato) - readable-side reconcile
// ════════════════════════════════════════════════════════════════════════
// Bruges hvor BEGGE sider er læsbare plaintext-entries (fx Mentem-decrypt-side,
// eller fremtidig klient-læsbar kladde). Server-draften er pinned-key-ciphertext
// → klienten kan IKKE læse den (asymmetrisk, §1 "ingen ny primitiv"); klientens
// ITP-recovery sker derfor på BLOB-niveau (hele krypterede kladde overlever).
// newest-wins via `savedAt`; server-authoritative ved tie/manglende stempel.
export function mergeDiaryEntries(localEntries, serverEntries) {
  const byDate = new Map();
  for (const e of (serverEntries || [])) byDate.set(e.date, e);      // server-baseline (authoritative)
  for (const e of (localEntries || [])) {
    const ex = byDate.get(e.date);
    if (!ex) { byDate.set(e.date, e); continue; }
    if ((e.savedAt || '') > (ex.savedAt || '')) byDate.set(e.date, e); // lokal strengt nyere → vinder
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ════════════════════════════════════════════════════════════════════════
//  SØVN-BASELINE-PAYLOAD (engangs intake → opaque eksport)
// ════════════════════════════════════════════════════════════════════════
// Ren data-capture (nul-score). Ny gren `payload.baseline = {…}` ved siden af
// questionnaireScores/casTrends/beliefRatings/sleepDiary. Swift ignorerer
// ukendte felter ved decode → bagudkompatibelt (fuld ingest = P2-schema-touch,
// ikke Fase 1; standalone-visning først, Q5).
export function buildPayloadBaseline(answers, meta = {}) {
  const now = isoNoFrac(new Date());
  const baseline = {};
  for (const f of SOEVN_BASELINE.fields) {
    const v = answers[f.key];
    if (v != null && v !== '') baseline[f.key] = v;
  }
  return {
    version: 1,
    afsender: afsenderStempel(),
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: ['soevn-baseline'],
    baselineType: 'soevn-intake',
    // INTET consent-felt (GDPR-register 1.6, Viktor 16/7): en soevn-baseline fra en klient i
    // forloeb er BEHANDLINGSDATA. Retsgrundlaget er art. 9(2)(h) jf. 9(3) + databeskyttelseslovens
    // §7 stk. 3 — IKKE samtykke (register 1.3: aldrig samtykke-checkbox for selve databehandlingen).
    // Oplysningspligten (art. 13) loeftes af oplysningsteksten paa baseline-welcome (register 1.4).
    // Et samtykke-felt her ville vaere et FORKERT retsgrundlag i journalen: derfor udeladt, og
    // meta.consent ignoreres bevidst (data-minimering). Soevndagbogen = separat, uafklaret sag.
    baseline,
  };
}

// ════════════════════════════════════════════════════════════════════════
//  SØVN-SCREENING-PAYLOAD (engangs → krypteret ingest, egen Mentem-rute)
// ════════════════════════════════════════════════════════════════════════
// Emitterer PRÆCIS den JSON Mentem-decoderen er testet mod (SoevnScreeningIngest
// .parse / SoevnFaseCTests.testScreeningSvarPayloadRoundtrip er facit). Fail-loud:
// et ubesvaret påkrævet item kaster (ubesvaret må ALDRIG blive et tavst nej —
// tjeklistens scoringsregel; kun halsomfang må være null = "ved ikke"). Ingen
// scoring her: STOP-Bang-score + rød-flag beregnes ALENE Mentem-side (én
// sandhedskilde, SoevnScreeningRoedFlag). Envelope-wrap som søvndagbogen.
export const SOEVN_SCREENING_SCHEMA_TYPE = 'soevn-screening';

// Kliniker-side item-keys der ALDRIG må optræde i en klient-payload (defense-in-
// depth, spejler Swift-sidens defensive somInput-filter): suicidalitet er
// kliniker-side (Viktor 2/7) — smugles keyen ind, kaster vi frem for at sende.
export const SCREENING_KLINIKER_KEYS = ['aktuelSuicidalitet'];

function screeningFejl(code, felt) {
  const e = new Error(felt ? `${code}:${felt}` : code);
  e.code = code; if (felt) e.felt = felt;
  return e;
}

// Æ2 wire-enum: klientens køns-svar. koenMand AFLEDES (mand=ja, kvinde/andet=nej);
// det rå svar sendes med i screeningSvar.koen (Mentem viser det råt + flager "andet" GUL).
export const SCREENING_KOEN_VALG = ['mand', 'kvinde', 'andet'];

// Alderens tilladte spænd. SPEJLER Swift-siden ORDRET (SoevnKlinikerPrefStore.swift,
// SoevnAlder.spænd: `guard vedStart >= 0, vedStart < 130`) - en alder web-siden slipper
// igennem, men Mentem afviser, ville blive tavst tabt på vej til gaten.
// 🔴 FAIL-SAFE-RETNINGEN ER BRED, IKKE SNÆVER. Et for snævert spænd BLOKERER en ægte
// klient i at sende skemaet (hård fejl, klient-side og usynlig for Viktor); et for bredt
// spænd slipper en tastefejl igennem, som Viktor SER i review og som gatens egen guard
// fanger. Derfor sættes grænsen hvor Swift-guarden allerede står, ikke ved et gæt på
// hvor gamle klienter »plejer« at være.
export const SCREENING_ALDER_MIN = 0;
export const SCREENING_ALDER_MAX = 129;

export function buildPayloadScreening(svar = {}, meta = {}) {
  for (const k of SCREENING_KLINIKER_KEYS) {
    if (k in svar) throw screeningFejl('klinikerItemForbudt', k);
  }
  // Alderen valideres FØR loopet, fordi dens afledte STOP-Bang-boolean sættes INDE i
  // loopet - på itemets egen plads, så wire-rækkefølgen på stopBang er uændret.
  const alder = svar.alder;
  if (alder == null || alder === '') throw screeningFejl('paakraevet_mangler', 'alder');
  if (typeof alder !== 'number' || !Number.isInteger(alder)
      || alder < SCREENING_ALDER_MIN || alder > SCREENING_ALDER_MAX) {
    throw screeningFejl('ugyldig_tal', 'alder');
  }
  const stopBang = {};
  for (const f of SOEVN_SCREENING.stopBangItems) {
    if (f.koensValg) continue;                                           // Æ2: koenMand afledes nedenfor
    // Alder: tallet sendes råt som screeningSvar.alder (nedenfor), og STOP-Bang-
    // booleanen afledes HER, så den bevarer sin plads blandt de 8 felter.
    if (f.talFelt) { stopBang[f.afledt.key] = (alder > f.afledt.over); continue; }
    const v = svar[f.key];
    if (f.vedIkke && v === null) { stopBang[f.key] = null; continue; }   // "Ved ikke" → null (aldrig nej)
    if (v !== true && v !== false) throw screeningFejl('paakraevet_mangler', f.key);
    stopBang[f.key] = v;
  }
  // Æ2: koen er påkrævet enum; koenMand afledes så STOPBang-kontrakten (8 bool-felter,
  // koenMand sidst) er UÆNDRET på wiren. Dataminimering (Æ1): evt. hoejde/vaegt/bmi-keys
  // i svar-objektet læses ALDRIG (kun kendte item-keys emitteres) — BMI-tal forlader
  // aldrig browseren.
  const koen = svar.koen;
  if (koen == null || koen === '') throw screeningFejl('paakraevet_mangler', 'koen');
  if (!SCREENING_KOEN_VALG.includes(koen)) throw screeningFejl('ugyldig_enum', 'koen');
  stopBang.koenMand = (koen === 'mand');
  const kontraindikationer = [];
  for (const f of SOEVN_SCREENING.kontraItems) {
    const v = svar[f.key];
    if (v !== true && v !== false) throw screeningFejl('paakraevet_mangler', f.key);
    if (v === true) kontraindikationer.push(f.key);
  }
  const screeningSvar = { stopBang, kontraindikationer, koen, alder };
  const fritekst = (typeof svar.fritekst === 'string') ? svar.fritekst.trim() : '';
  if (fritekst) screeningSvar.fritekst = fritekst;

  const now = isoNoFrac(new Date());
  const data = {
    version: 1,
    // Stemplet ligger i `data`, ALDRIG paa konvolut-toppen: Swift-decoderen
    // (IngestKonvolut) har faste felter og ville tabe et ukendt top-felt tavst,
    // mens `data` bevares uaendret hele vejen ind (FELT-BEVARENDE, 0 tab).
    afsender: afsenderStempel(),
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: [SOEVN_SCREENING_SCHEMA_TYPE],
    screeningSvar,
  };
  return buildIngestKonvolut(data, {
    schemaType: SOEVN_SCREENING_SCHEMA_TYPE,
    schemaVersion: 1,
    clientTimestamp: now,
  });
}

// ════════════════════════════════════════════════════════════════════════
//  FORLØBS-ANMODNING (ANMOD-V1) - ingest-skema "forloebs-anmodning"
// ════════════════════════════════════════════════════════════════════════
// FROSSET kontrakt: noter/contract-forloebs-anmodning-ingest-2026-06-19.md (§1–§3),
// afledt 1:1 af PsykologInvitation/ForloebsAnmodningKonvolut.swift (parser = ground-truth).
// Web-form OG app-submit-UI OG bakke-parser SKAL matche §1–§3 byte-for-byte (kontrakt-drift
// = søvndagbog-ULÆSELIG-rod). Den FLADE §2-payload pakkes i `data` på SAMME envelope-wrap-måde
// som søvndagbog (buildIngestKonvolut → {schemaVersion, schemaType, clientTimestamp, data, clientUA}).
// Krypto er UÆNDRET (mentemEncrypt mod INGEST-X25519-pubkey, zero-knowledge - siden har KUN
// public-key). RØR ALDRIG skema-felt-definitionerne; kun transport-formen tilføjes her.

export const ANMOD_SCHEMA_TYPE = 'forloebs-anmodning';   // §1 AUTORITATIV wire-streng (ren ASCII, ø→oe)

// §2 enums (wire-værdier - IKKE visningstekst). v2.1 (adaptiv-grundlags-betinget):
//   grundlag 4→3-vejs; FJERNET forloebstype/holdDag/holdTid; TILFØJET henvisning_psykiater/
//   forloeb_tilbudt/tid_praeference. forloeb_resolved er SYSTEM-AFLEDT (aldrig på wire).
export const ANMOD_GRUNDLAG             = ['psykiater', 'forsikring', 'egenbetaler'];
export const ANMOD_HENVISNING_PSYKIATER = ['vestegnsklinikken', 'westergaard', 'ved_ikke']; // KUN psykiater (valgfri)
export const ANMOD_FORLOEB_TILBUDT      = ['gruppe', 'individuelt', 'ved_ikke'];             // KUN psykiater (REQ); = TILBUDT
export const ANMOD_TID_DAGE             = ['tirsdag', 'onsdag', 'torsdag', 'fredag'];        // KUN forloeb_tilbudt=gruppe
export const ANMOD_TID_TIDER            = ['14:00', '15:30'];                                // KUN forloeb_tilbudt=gruppe
export const ANMOD_TID_VED_IKKE         = 'ved_ikke';                                        // "Ved ikke endnu" → wire-token
// Grundlag der STILLER psykiater-grenens spørgsmål (henvisning + forloeb_tilbudt) i UI.
export const ANMOD_SPOERG_PSYKIATER     = ['psykiater'];

// §6 art.9-deny - disse keys må ALDRIG bære helbreds-/CPR-data; til stede => hård parse-fejl.
export const ANMOD_ART9_DENY = ['cpr', 'helbred', 'diagnose', 'diagnosis', 'medicin', 'sygdom', 'symptom', 'health', 'journal'];

// §2 visningsnavne (korrekt æøå - IKKE wire-værdier). Single source for web + app.
// Psykiater-klinik: personnavn (Hoff/Westergaard) er display-only (wire = klinik-id).
export const ANMOD_DISPLAY = {
  grundlag:            { psykiater: 'Henvist via egen læge til speciallæge i psykiatri (psykiater)', forsikring: 'Via forsikring', egenbetaler: 'Egenbetaler' },
  henvisning_psykiater:{ vestegnsklinikken: 'Vestegnsklinikken (Andreas Hoff)', westergaard: 'Westergaard Psykiatri (Casper Westergaard)', ved_ikke: 'Ved ikke' },
  forloeb_tilbudt:     { gruppe: 'Gruppeforløb', individuelt: 'Individuelt forløb', ved_ikke: 'Ved ikke' },
  tid_dage:            { tirsdag: 'Tirsdag', onsdag: 'Onsdag', torsdag: 'Torsdag', fredag: 'Fredag' },
  tid_tider:           { '14:00': 'kl. 14:00', '15:30': 'kl. 15:30' },
  tid_ved_ikke:        'Ved ikke endnu',
};

// §2b PINNET samtykke-ordlyd (wording-version v2-2026-06-19, em-dash-fri): renderes PRÆCIST på
// BEGGE flader (web + app). `[privatlivspolitikken]` = dp.dk-skabelon-link-TODO (interim-placeholder).
// Brand siger ALTID "Psykolog Viktor Nielsen", ALDRIG "Mycel". Betydning UÆNDRET fra v1-interim
// (kun em-dash → komma; endelig jur. ordlyd stadig pending review).
export const ANMOD_CONSENT_WORDING_VERSION = 'v2-2026-06-19';
export const ANMOD_CONSENT_WORDING =
  'Jeg samtykker til, at Psykolog Viktor Nielsen behandler de oplysninger, jeg giver i denne anmodning, '
  + 'herunder at oplysningerne kan afsløre, at jeg søger psykologbehandling, med det formål at behandle '
  + 'og besvare min anmodning om forløbsadgang. Jeg kan til enhver tid trække anmodningen og mit samtykke '
  + 'tilbage. Læs hvordan dine oplysninger behandles i [privatlivspolitikken].';

function anmodFejl(code, felt) {
  const e = new Error(felt ? `${code}:${felt}` : code);
  e.code = code; if (felt) e.felt = felt;
  return e;
}
function anmodText(v, felt) {
  if (typeof v !== 'string' || !v.trim()) throw anmodFejl('paakraevet_mangler', felt);
  return v.trim();
}
function anmodEnum(v, allow, felt) {
  if (!allow.includes(v)) throw anmodFejl('ugyldig_enum', felt);
  return v;
}

// tid_praeference (KUN forloeb_tilbudt=gruppe): null (udeladt) | 'ved_ikke' | {dage:[...],tider:[...]}
// (enum-valideret, dedup'et; tom-tom → 'ved_ikke'). 1:1 m. Swift parseTidPraeference.
function byggTidListe(arr, allow, felt) {
  if (arr === null || arr === undefined) return [];
  if (!Array.isArray(arr)) throw anmodFejl('ugyldig_tid_praeference', felt);
  const out = [];
  for (const el of arr) {
    if (!allow.includes(el)) throw anmodFejl('ugyldig_enum', felt);
    if (!out.includes(el)) out.push(el);
  }
  return out;
}
function byggTidPraeference(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (v === ANMOD_TID_VED_IKKE) return ANMOD_TID_VED_IKKE;
    throw anmodFejl('ugyldig_tid_praeference', 'tid_praeference');
  }
  if (typeof v !== 'object' || Array.isArray(v)) throw anmodFejl('ugyldig_tid_praeference', 'tid_praeference');
  const dage  = byggTidListe(v.dage,  ANMOD_TID_DAGE,  'tid_dage');
  const tider = byggTidListe(v.tider, ANMOD_TID_TIDER, 'tid_tider');
  if (dage.length === 0 && tider.length === 0) return ANMOD_TID_VED_IKKE;
  return { dage, tider };
}

/// Byg den FROSNE forløbs-anmodnings-konvolut fra rå form-input (fail-loud).
/// Validerer §2 (påkrævede felter + enums + gruppe-eksklusiv slot + atten/samtykke=true +
/// art.9-deny) og wrapper i IngestKonvolut (§3). Kaster Error med `.code`/`.felt` ved afvigelse
/// (kalderen mapper til en dansk fejlbesked). Returnerer konvolut-objektet (klar til mentemEncrypt).
export function buildAnmodKonvolut(input = {}) {
  // §6 art.9-deny FØRST: en lækket flade må aldrig kunne importere art.9-data tavst.
  for (const k of Object.keys(input)) {
    if (ANMOD_ART9_DENY.includes(String(k).toLowerCase())) throw anmodFejl('art9Forbudt', k);
  }

  // Rækkefølge 1:1 med Swift-parseren (ForloebsAnmodningKonvolut.parse): fornavn/efternavn →
  // grundlag → atten → samtykke → forloebstype → hold-slot (samme fejl-præcedens).
  const data = { type: ANMOD_SCHEMA_TYPE };                 // informativ mirror (parseren keyer på konvolut-schemaType)
  data.fornavn   = anmodText(input.fornavn, 'fornavn');
  data.efternavn = anmodText(input.efternavn, 'efternavn');
  data.grundlag  = anmodEnum(input.grundlag, ANMOD_GRUNDLAG, 'grundlag');

  if (input.atten !== true)         throw anmodFejl('atten_paakraevet', 'atten');           // 18+ gate, MÅ være true
  data.atten = true;
  if (input.anmodSamtykke !== true) throw anmodFejl('samtykke_paakraevet', 'anmodSamtykke'); // art.9(2)(a), MÅ være true
  data.anmodSamtykke = true;

  // forloeb_resolved er SYSTEM-AFLEDT (Swift-side: grundlag∈{forsikring,egenbetaler} → "individuelt").
  // Det er ALDRIG et wire-felt → en flade må ikke smugle det ind (defense-in-depth; 1:1 m. parseren,
  // der afviser forloeb_resolved på wire). Bygges derfor ALDRIG ind i `data`.
  if (input.forloeb_resolved != null && input.forloeb_resolved !== '') {
    throw anmodFejl('forloeb_resolved_ikke_tilladt', 'forloeb_resolved');
  }

  // v2.1 adaptiv forgrening (grundlag styrer; fail-loud kryds-felt-validering, 1:1 m. Swift-parseren).
  const erPsykiater = ANMOD_SPOERG_PSYKIATER.includes(data.grundlag);
  const hRaw  = (input.henvisning_psykiater != null && input.henvisning_psykiater !== '') ? input.henvisning_psykiater : null;
  const tRaw  = (input.forloeb_tilbudt      != null && input.forloeb_tilbudt      !== '') ? input.forloeb_tilbudt      : null;
  const tidIn = (input.tid_praeference      != null && input.tid_praeference      !== '') ? input.tid_praeference      : null;

  if (erPsykiater) {
    // henvisning_psykiater: VALGFRI (udeladt/ved_ikke ok); enum-valideret hvis angivet.
    if (hRaw !== null) data.henvisning_psykiater = anmodEnum(hRaw, ANMOD_HENVISNING_PSYKIATER, 'henvisning_psykiater');
    // forloeb_tilbudt: REQUIRED (semantik = hvad psykiateren har TILBUDT, ikke ønsket).
    if (tRaw === null) throw anmodFejl('paakraevet_mangler', 'forloeb_tilbudt');
    data.forloeb_tilbudt = anmodEnum(tRaw, ANMOD_FORLOEB_TILBUDT, 'forloeb_tilbudt');
    // tid_praeference: tilladt KUN iff forloeb_tilbudt=gruppe (FORBUDT ellers).
    if (data.forloeb_tilbudt === 'gruppe') {
      const tp = byggTidPraeference(tidIn);          // null (udeladt) | 'ved_ikke' | {dage,tider}
      if (tp !== null) data.tid_praeference = tp;
    } else if (tidIn !== null) {
      throw anmodFejl('tid_praeference_ikke_tilladt', 'tid_praeference');
    }
  } else {
    // forsikring/egenbetaler: psykiater-grenens felter FORBUDT (fail-loud). forloeb_resolved afledes
    // Swift-side ("individuelt - fast") - bygges ALDRIG ind i wire-payloaden her.
    if (hRaw  !== null) throw anmodFejl('henvisning_ikke_tilladt', 'henvisning_psykiater');
    if (tRaw  !== null) throw anmodFejl('forloeb_tilbudt_ikke_tilladt', 'forloeb_tilbudt');
    if (tidIn !== null) throw anmodFejl('tid_praeference_ikke_tilladt', 'tid_praeference');
  }

  // S1 (v2.1): telefon PÅKRÆVET (adgangslinket sendes via SMS) => fail-loud hvis tom/whitespace.
  // email VALGFRI (anbefales for desktop). FJERNET det kombinerede `kontakt`-felt.
  if (typeof input.telefon !== 'string' || !input.telefon.trim()) throw anmodFejl('telefonPaakraevet', 'telefon');
  data.telefon = input.telefon.trim();
  // Valgfri: tom/whitespace => behandles som fraværende (udeladt af payload).
  if (typeof input.email === 'string' && input.email.trim()) data.email = input.email.trim();
  if (typeof input.note === 'string'  && input.note.trim())  data.note  = input.note.trim();

  return buildIngestKonvolut(data, {
    schemaType: ANMOD_SCHEMA_TYPE,
    schemaVersion: 1,
    clientTimestamp: isoNoFrac(new Date()),
  });
}

// ════════════════════════════════════════════════════════════════════════
//  Q17 - »spørg aldrig om det vi allerede har« (Viktor-GO 17=1)
// ════════════════════════════════════════════════════════════════════════
// Spec: kanonisk/specs/2026-08-21-viktors-fem-svar-bygget.md §Q17.
//   har vi feltet, og er det PÅLIDELIGT   -> spring spørgsmålet over, tavst
//   har vi feltet, men med LAV KONFIDENS  -> vis det til bekræftelse, spørg ikke forfra
//   har vi det ikke                       -> spørg
//   er feltet FØLSOMT (CPR)               -> spring over uanset, og vis det ALDRIG
//
// Denne fil er FLADENS halvdel. Serversidens halvdel (»hvad har vi allerede om denne
// klient«) er MJ BUILDERs, og kontrakten nedenfor er det eneste de to deler.
//
// 🔴 MÅLT FØR JEG BYGGEDE, og det ændrede formen tre steder:
//
// 1. Fladen stiller i dag PRÆCIS ÉT stamdata-spørgsmål: `patient-name`
//    (»Dit navn (valgfrit)«). Telefon: 0 forekomster som felt. CPR: 0 forekomster.
//    Q17's tre andre rækker er allerede opfyldt af at spørgsmålene ikke findes.
//    ⇒ Reglen har én kaldeflade i dag, og gaten nedenfor er det der holder den ene.
//
// 2. `clientName` er IKKE pynt. Den er redningsnettet når token-joinet fejler:
//    MentemSyncService.swift:201 `fallbackKlient(forKlientNavn:)` er det eneste
//    der importerer en dekrypteret payload når `findByToken` giver nil, og
//    KlientDataImportVC bygger hele den manuelle import op om den.
//    ⇒ **At springe SPØRGSMÅLET over må aldrig springe SVARET over.** Derfor kræver
//    `spring` at serveren sendte en VÆRDI vi kan lægge i payloaden i stedet.
//    »Pålidelig« uden værdi falder til `spoerg`, ikke til `spring`: at spørge er
//    harmløst, at miste nettet er det ikke.
//
// 3. Nul-viden-postkassen (migrations/0001_init.sql, Viktor-besluttet 18/6:
//    »Worker ser KUN ciphertext + pseudonym. Ingen navn, klartekst eller nøgle på
//    disk«) kan IKKE svare på dette opslag uden at holde op med at være det den er.
//    ⇒ Kontrakten er derfor bundet til et ORIGIN der må kende klienten (Journal),
//    ikke til `ingest.mycel.dk`. Se `Q17_KENDT_KONTRAKT.origin`.

// De ENESTE felter der må nå fladen. Alt andet er en fejl hos afsenderen, ikke
// et felt vi ignorerer: en server der sender CPR, er en server hvis øvrige svar
// vi heller ikke kan stole på. Fail-loud, og fald tilbage til at spørge om alt.
export const Q17_TILLADTE_FELTER = ['navn'];

// Felter der kan nævnes for at blive AFVIST med en navngiven grund. Uden denne
// liste ville »cpr« bare være et ukendt felt, og afvisningen ville læse som en
// tastefejl frem for som den regel den er.
export const Q17_FORBUDTE_FELTER = {
  cpr:     'CPR må aldrig på en klientvendt flade (spec §Q17)',
  telefon: 'telefonen er verificeret ved konstruktion: hun åbnede linket vi sendte på SMS',
};

export const Q17_TILSTANDE = ['paalidelig', 'lav', 'ukendt'];

// Kontrakten, ét sted, så fladen og serveren ikke kan drive fra hinanden.
// 🔴 RETTET 24/8 af MJ BUILDER (`22d82f4ad713`), og begge rettelser er deres hus:
//   rute   `/klient/kendt` -> `/offentlig/klient-kendt`. Deres tunnel-regel er path
//          `^/offentlig/`, saa min oprindelige rute ville ALDRIG have svaret en browser,
//          og `/klient/` er desuden et login-praefiks hos dem (`klient/ny/` er login_required).
//   metode GET -> POST, med tokenet i KROPPEN frem for i query-strengen. Deres tre
//          oevrige token-ruter goer allerede saadan.
//
// 🟡 DERES BEGRUNDELSE FOR POST HOLDT IKKE, og det er noteret her saa den ikke arves:
// de skrev at »et token maa aldrig staa i URLen« er en husregel. Maalt: det er den ikke.
// `SoevnKaede.swift:92` bygger `&t=<token>` ind i praecis det link Viktor SMS'er til
// klienter i prod i dag (ratificeret 17/8). Klientens EGEN side-URL BAERER tokenet , det
// er den maade hun kom herhen paa. Var reglen husbred, brød hele soevn-kaeden den.
//
// 🟢 Men POST er stadig rigtigt, af en anden grund end den de gav: forskellen er ikke
// sti mod query, den er HVEM DER SER DEN. Klientens egen URL ser kun hun og vi; et KALD
// herfra til et fremmed origin kan derimod baere URLen videre i `Referer`.
// 🔴 RETTELSE 24/8, OG DEN FORRIGE UDGAVE AF DENNE KOMMENTAR VAR FALSK.
// Her stod: »fladen erklaerer INGEN Referrer-Policy (0 traef ... ingen header fra prod)«.
// Det er ikke sandt. Maalt paa ny med POS-KTRL:
//     curl -sI https://skemaer.mycel.dk/   -> 200, 686 bytes
//       referrer-policy: strict-origin-when-cross-origin
//       cache-control:   public, max-age=0, must-revalidate
//       x-content-type-options: nosniff
//     POS-KTRL `server:` -> 1 traef · NEG-KTRL `x-fnord` -> 0
// Cloudflare Pages saetter dem allerede, og `strict-origin-when-cross-origin` striber
// path og query cross-origin. Fladen HVILER altsaa ikke paa en browser-default , den
// erklaerer en, og tokenet i `&t=` naar ikke et fremmed origin via `Referer`.
//
// 🔵 HVORFOR DEN FORRIGE MAALING VAR FALSK, for fejlen er mere laererig end fundet:
// samme `curl -sI ... | grep -i referrer` blev koert 23/8 og gav nul traef. Kort efter
// begyndte ALLE prod-kald at fejle (rc 35 / rc 000): en VPN var kommet op og svarede paa
// AL DNS med 192.168.213.2 , ogsaa for `example.com` og `github.com`. Grep'et havde ingen
// POS-KTRL, saa et TOMT svar og en manglende header gav samme nul. Havde jeg greppet efter
// `server:` eller `HTTP/` ved siden af, var det set med det samme.
// **Et nul fra en doed naal er ikke til at skelne fra det gode nul.**
//
// 🟡 Tilbage staar en aegte, mindre pointe: policyen er Cloudflares default, ikke husets
// beslutning. `no-referrer` ville stribe ogsaa origin. MJ BUILDER rangerede Cache-Control
// hoejere end det, og de har ret , et svar der baerer et klientnavn maa ikke kunne caches,
// og det er DERES endpoint der baerer navnet. Deres side er lukket i `660188a`.
export const Q17_KENDT_KONTRAKT = {
  rute: '/offentlig/klient-kendt',
  metode: 'POST',
  // Tokenet ligger i JSON-kroppen som `{ t }`, ikke i query-strengen.
  kropsnoegle: 't',
  // 🔴 IKKE ingest.mycel.dk. Se punkt 3 ovenfor.
  origin: 'journal',
  svar: { ok: true, felter: { navn: { tilstand: 'paalidelig|lav|ukendt', vaerdi: 'string|null' } } },
  version: 1,
};

/// Dommen for ÉT felt. Ren funktion: ingen DOM, ingen netværk, ingen ur.
/// Returnerer { handling, vaerdi, grund }.
///   handling: 'spring' | 'bekraeft' | 'spoerg' | 'forbudt'
export function q17FeltDom(felt, post) {
  if (Object.prototype.hasOwnProperty.call(Q17_FORBUDTE_FELTER, felt)) {
    return { handling: 'forbudt', vaerdi: null, grund: Q17_FORBUDTE_FELTER[felt] };
  }
  if (!Q17_TILLADTE_FELTER.includes(felt)) {
    return { handling: 'forbudt', vaerdi: null, grund: 'ukendt felt »' + felt + '« er ikke på tilladelseslisten' };
  }
  if (!post || typeof post !== 'object') {
    return { handling: 'spoerg', vaerdi: null, grund: 'intet svar for feltet' };
  }
  if (!Q17_TILSTANDE.includes(post.tilstand)) {
    return { handling: 'spoerg', vaerdi: null, grund: 'ukendt tilstand »' + String(post.tilstand) + '«' };
  }
  const vaerdi = (typeof post.vaerdi === 'string' ? post.vaerdi.trim() : '');
  if (post.tilstand === 'ukendt') return { handling: 'spoerg', vaerdi: null, grund: 'vi har det ikke' };
  if (!vaerdi) {
    // Se punkt 2 i hovedkommentaren: dette er den dyre celle.
    return { handling: 'spoerg', vaerdi: null, grund: 'tilstand »' + post.tilstand + '« uden værdi: at springe over ville miste redningsnettet for navnet' };
  }
  if (post.tilstand === 'paalidelig') return { handling: 'spring', vaerdi, grund: 'journalen har det pålideligt' };
  return { handling: 'bekraeft', vaerdi, grund: 'lav konfidens: vis til bekræftelse, spørg ikke forfra' };
}

/// Dommen for HELE svaret. Et forbudt felt forgifter hele svaret (fail-closed):
/// alle felter falder til `spoerg`, og `afvist` bærer grundene.
export function q17Dom(svar) {
  const tomt = { felter: {}, afvist: [], brugt: false };
  if (!svar || typeof svar !== 'object' || svar.ok !== true || !svar.felter || typeof svar.felter !== 'object') {
    return { ...tomt, afvist: svar ? ['svaret har ikke formen { ok: true, felter: {...} }'] : [] };
  }
  const felter = {};
  const afvist = [];
  for (const navn of Object.keys(svar.felter)) {
    const d = q17FeltDom(navn, svar.felter[navn]);
    if (d.handling === 'forbudt') { afvist.push(navn + ': ' + d.grund); continue; }
    felter[navn] = d;
  }
  if (afvist.length) return { felter: {}, afvist, brugt: false };
  return { felter, afvist: [], brugt: true };
}

/// Hvad `patient-name`-feltet skal gøre. Én linje, så kaldestedet i index.html
/// ikke kan komme til at fortolke dommen på sin egen måde.
export function q17NavneHandling(dom) {
  const d = dom && dom.felter && dom.felter.navn;
  if (!d) return { handling: 'spoerg', vaerdi: null };
  return { handling: d.handling, vaerdi: d.vaerdi };
}

// ════════════════════════════════════════════════════════════════════════
//  KEY-PINNING (sikkerheds-hærdning, P1a) - trust anchor i siden
// ════════════════════════════════════════════════════════════════════════
// Mentems E2E X25519-public-key er PINNED i koden - IKKE taget fra ?pk=-URL-
// feltet. Det forhindrer en manipuleret URL i at få klienten til at kryptere
// helbredsdata til en FREMMED nøgle (attacker-in-the-middle via link).
// KRYPTO-GUARD: kun den OFFENTLIGE nøgle her. Rotation = redeploy med ny
// PINNED_PUBKEY + bump af PINNED_KEY_ID (stemples i hver container → Mentem
// kan detektere nøgle-version-mismatch ved decrypt).
//
// PINNED_KEY_ID = første 8 hex af SHA-256(rå 32-byte pubkey).
export const PINNED_PUBKEY = 'M8LHgVyDALEoCtm_Q6C2dZ73qPHvqy8VGtiLUiSjUwI';
export const PINNED_KEY_ID = '8aa536a1';

/// Normalisér en nøgle til sammenligning (base64url/base64 + uden padding).
function normKey(k) {
  return (k || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').trim();
}

/// Afgør hvilken modtager-nøgle der må krypteres til. PINNED er autoritativ.
/// - intet ?pk= → brug pinned.
/// - ?pk= == pinned (uanset base64/base64url) → ok.
/// - ?pk= != pinned → AFVIS (krypter ALDRIG til en fremmed nøgle).
/// Returnerer { ok, key, keyId, reason }.
export function resolveRecipientKey(pkParam) {
  if (pkParam && normKey(pkParam) !== normKey(PINNED_PUBKEY)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, key: PINNED_PUBKEY, keyId: PINNED_KEY_ID };
}

// ════════════════════════════════════════════════════════════════════════
//  KRYPTO - public-key-only opaque output (R3)
// ════════════════════════════════════════════════════════════════════════
function b64ToBytes(b64) {
  // Accepter både standard-base64 OG base64url (?pk=-transport).
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(s, 'base64'));
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  const u = new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
  let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
}

/// 🔴 SHIP-GATE-FLAG: aktivér den rene-JS X25519-fallback (browser-uafhængig kryptering).
/// DEFAULT false => uændret adfærd (X25519-løse browsere får "åbn i Chrome/Safari"; fallback
/// er dormant). Flip til true KUN efter BEGGE gates er grønne:
///   1. test/x25519-fallback-roundtrip.mjs (JS-side, RFC-vektorer + WebCrypto-oracle).
///   2. app-side CryptoKit-roundtrip (StaticSiteCryptoRoundTripTests mod en fallback-container,
///      via `node test/encrypt-fixture.mjs <pub> --force-fallback`) + Viktor-GO.
/// Aktivering uden den gate => risiko for silent decrypt-fail (værre end den synlige fejl nu).
export const X25519_FALLBACK_AKTIV = true;

/// Findes WebCrypto subtle + secure context (forudsætning for HKDF+AES-GCM, som begge stier bruger)?
/// `isSecureContext` er undefined i Node (CryptoKit-gate-harnessen), hvor subtle altid er sikker;
/// bloker derfor KUN når den eksplicit er false (usikker http-browser-kontekst).
function subtleTilgaengelig() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  return !!s && globalThis.isSecureContext !== false;
}

/// Feature-test: understøtter crypto.subtle X25519? Ældre/indlejrede Android-browsere mangler
/// primitiven (selv når subtle findes) => nøglegenerering kaster. Cachet (ét forsøg pr. side-load).
let _x25519WC = null;
async function x25519WebCryptoStoettet() {
  if (_x25519WC !== null) return _x25519WC;
  try {
    if (!subtleTilgaengelig()) { _x25519WC = false; return false; }
    await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    _x25519WC = true;
  } catch (_e) { _x25519WC = false; }
  return _x25519WC;
}

/// "Kan vi faktisk kryptere?" Feature-detektér FØR udfyldning/Send. Med fallback AKTIV rækker
/// WebCrypto subtle (X25519-hullet dækkes af ren-JS-fallbacken); uden fallback (default) kræves
/// WebCrypto-X25519. Bruges af klient-UI til banner/fejl-besked.
export async function kryptoStoettet() {
  if (!subtleTilgaengelig()) return false;
  if (X25519_FALLBACK_AKTIV) return true;
  return await x25519WebCryptoStoettet();
}

/// Krypter et payload-objekt mod modtagerens X25519-public-key (base64 / base64url).
/// Returnerer et KrypteretEksportContainer-objekt (klar til JSON.stringify).
/// `keyId` stemples i containeren (default = PINNED_KEY_ID) så Mentem kan
/// detektere nøgle-version-mismatch ved decrypt. Swift-decrypt ignorerer
/// ukendte felter → bagudkompatibelt.
export async function mentemEncrypt(recipientPubB64, payloadObj, keyId = PINNED_KEY_ID, opts = {}) {
  // Forudsætning: WebCrypto subtle (HKDF+AES-GCM, som begge ECDH-stier bruger). Mangler den,
  // kast en TYPET fejl FØR vi rører nøgler/data, så kalderen viser "åbn i Chrome/Safari" i
  // stedet for en generisk krypto-fejl.
  if (!subtleTilgaengelig()) {
    const err = new Error('WebCrypto (subtle) er ikke tilgængelig i denne browser');
    err.name = 'CryptoUnsupportedError';
    throw err;
  }
  const subtle = globalThis.crypto.subtle;
  const recipientPubBytes = b64ToBytes(recipientPubB64);

  // ECDH-sti-valg. PRIMÆR: WebCrypto-X25519 (uændret). FALLBACK: ren-JS X25519 (RFC 7748,
  // byte-eksakt mod WebCrypto/CryptoKit; se test/x25519-fallback-roundtrip.mjs). Krypto-outputtet
  // (format/contract) er identisk i begge stier, så zero-knowledge er urørt. opts.tvingFallback
  // tvinger fallback-stien (kun til roundtrip-fixturen / CryptoKit-gaten).
  const x25519WC = await x25519WebCryptoStoettet();
  const brugFallback = opts.tvingFallback === true || (!x25519WC && X25519_FALLBACK_AKTIV);
  if (!x25519WC && !brugFallback) {
    const err = new Error('X25519-WebCrypto er ikke understøttet i denne browser');
    err.name = 'CryptoUnsupportedError';
    throw err;
  }

  // Rå 32-byte ephemeral public key + shared secret (sti-uafhængigt format; fresh ephemeral
  // pr. kryptering giver forward secrecy). Matcher CryptoKit sharedSecretFromKeyAgreement.
  let ephPubRaw, shared;
  if (brugFallback) {
    const { x25519 } = await import('./mentem-x25519-fallback.js');
    const ephPriv = x25519.utils.randomPrivateKey();
    ephPubRaw = x25519.getPublicKey(ephPriv);
    shared = x25519.getSharedSecret(ephPriv, recipientPubBytes);
  } else {
    const recipientPub = await subtle.importKey('raw', recipientPubBytes, { name: 'X25519' }, false, []);
    const eph = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    ephPubRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
    shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: recipientPub }, eph.privateKey, 256));
  }

  // HKDF-SHA256 (salt random 32B, info låst til Mentem-kontrakten).
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const keyBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('TherapyCopilot-E2E-Export-v1') },
    ikm, 256);
  const aesKey = await subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt']);

  // AES-256-GCM (12-byte nonce). WebCrypto giver ct||tag konkateneret → split (tag = sidste 16B).
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
  const combined = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));
  const tag = combined.slice(combined.length - 16);
  const ciphertext = combined.slice(0, combined.length - 16);

  return {
    formatVersion: 1,
    formatIdentifier: 'therapy-copilot-encrypted-export',
    createdAt: isoNoFrac(new Date()),
    ephemeralPublicKey: bytesToB64(ephPubRaw),
    encryptedData: bytesToB64(ciphertext),
    nonce: bytesToB64(nonce),
    tag: bytesToB64(tag),
    salt: bytesToB64(salt),
    keyId,
  };
}


// ════════════════════════════════════════════════════════════════════════
//  INSTRUMENT-SKEMAER (kind:'instrument') - WHO-5 + PHQ-9, [MYCEL v1]-emitter
// ════════════════════════════════════════════════════════════════════════
// Standalone token-linkede effektmaal-skemaer (?s=who5 / ?s=phq9) paa det DELTE
// stepper-render-lag (samme et-spoergsmaal-ad-gangen + review + a11y som CAS-1).
// Web-submit emitterer en [MYCEL v1]-konvolut (kontrakt-mycel-v1-2026-06-26.md,
// MJ-ejet; vi emitter MOD den) som MJ's deterministiske, LENIENT parser laeser.
//
// COEKSISTENS: de GAMLE batteri-noegler SKEMAER.who5 / SKEMAER.phq9 (kind:'radio',
// i SKEMA_ORDER, AELDRE oversaettelse) er UROERT - de er laast af selftest + buildPayload.
// Disse standalone-instrumenter lever i et SEPARAT register (INSTRUMENTER) og rammes
// KUN af et SINGLE-token ?s=who5 / ?s=phq9 (routing-prioritet, se index.html). Et
// multi-token batteri (?s=cas,...,who5,...) gaar uaendret til batteri-flowet.
//
// FELT-KONTRAKT: feltnavne fra spec-kat-companion-byg-klar §3 (Viktor-leveret 27/6):
//   WHO-5: who5_item_1..5 (0-5), who5_raw (0-25 AFLEDT), who5_pct (raw x4, AFLEDT)
//   PHQ-9: phq9_item_1..9 (0-3), phq9_sum (0-27 AFLEDT), phq9_item9_flag (bool, item9>0),
//          phq9_funktion (0-3, funktionsspoergsmaal - taeller IKKE i sum, valgfri)
// MJ-kontrakten (§2/§3) definerer endnu IKKE who5/phq9-skabeloner -> additiv
// skabelon-blok skal tilfoejes MJ-side (relaeet, ikke redigeret her; MJ's parser er
// forward-kompat/lenient saa emissionen laeses uanset). Sum-felter ALTID afledt.
//
// FIDELITY: instrument-ordlyd VERBATIM fra spec §7 (WHO-PDF dansk / phqscreeners-dansk).
// PHQ-9 item 6+8 baerer en-dash i den officielle ordlyd = verbatim (instrument-region
// nedenfor undtaget em-dash-reglen). Vores EGEN UI-copy (index.html: knapper, fremskridt,
// Naeste/Forrige, review) er aeoeaa-korrekt + em-dash-fri. Ingen committet default paa
// items (klienten vaelger aktivt, samme princip som CAS-1 belief). PROD-GATE: klinisk
// verbatim-verifikation = Viktor (anbefalet kryds-tjek WHO-5 mod WHO-PDF + PHQ-9 mod
// phqscreeners.com-PDF). Preview-only.

// emdash-guard:instrument-start (WHO-5 © WHO 1998 + PHQ-9 public domain Spitzer/Williams/
// Kroenke: dansk klient-tekst gengivet VERBATIM fra officiel kilde, spec §7.1/§7.2. Em-dash-
// reglen viger KUN for instrument-gengivelsen. Vores egen UI-copy ligger i index.html, em-dash-fri.)

// WHO-5 svarkategorier VERBATIM (spec §7.1): 6 trin, hoej -> lav.
const WHO5_INSTRUMENT_OPTS = [
  { value: 5, label: 'Hele tiden' },
  { value: 4, label: 'Det meste af tiden' },
  { value: 3, label: 'Lidt mere end halvdelen af tiden' },
  { value: 2, label: 'Lidt mindre end halvdelen af tiden' },
  { value: 1, label: 'Lidt af tiden' },
  { value: 0, label: 'På intet tidspunkt' },
];

export const WHO5_INSTRUMENT = {
  id: 'who5', kind: 'instrument', skabelon: 'who5',
  uiTitle: 'Din trivsel', kort: 'WHO-5',
  // Instrument-instruktion VERBATIM (spec §7.1).
  instruktion: 'Sæt venligst ved hvert af de 5 udsagn et kryds i det felt der kommer tættest på hvordan du har følt dig i de seneste to uger. Bemærk at et højere tal står for bedre trivsel.',
  stem: 'I de sidste 2 uger ...',
  attribution: 'WHO-5 Trivselsindeks (1999). © WHO. CC BY-NC-SA 3.0 IGO.',
  // Synligt tal-badge (5..0) paa hver svarknap: instruktionen siger "et hoejere tal
  // staar for bedre trivsel", saa tallet skal vaere synligt for SEENDE klienter (og i
  // svar-knappens tilgaengelige navn for skaermlaeser). Per-instrument-flag, default OFF.
  // KUN WHO-5: PHQ-9 er 0-3 hvor hoejere=vaerre -> et tal ville aktivt vildlede klienten.
  showValueBadge: true,
  options: WHO5_INSTRUMENT_OPTS,
  scoredItems: [
    { key: 'who5_item_1', text: '... har jeg været glad og i godt humør' },
    { key: 'who5_item_2', text: '... har jeg følt mig rolig og afslappet' },
    { key: 'who5_item_3', text: '... har jeg følt mig aktiv og energisk' },
    { key: 'who5_item_4', text: '... er jeg vågnet frisk og udhvilet' },
    { key: 'who5_item_5', text: '... har min dagligdag været fyldt med ting der interesserer mig' },
  ],
  // Licens-/parathedsflag (spec §4): fri brug med kildeangivelse (WHO 1998), verbatim verificeret.
  licensStatus: 'fri-m-kildeangivelse',
  KLAR: true,
};

// PHQ-9 svarkategorier VERBATIM (spec §7.2): 4 trin, 0-3.
const PHQ9_INSTRUMENT_OPTS = [
  { value: 0, label: 'Slet ikke' },
  { value: 1, label: 'Flere dage' },
  { value: 2, label: 'Mere end halvdelen af dagene' },
  { value: 3, label: 'Næsten hver dag' },
];
// Funktionsspoergsmaal-svar VERBATIM (spec §7.2): taeller IKKE i sumscoren.
const PHQ9_FUNKTION_OPTS = [
  { value: 0, label: 'Slet ikke besværligt' },
  { value: 1, label: 'Lidt besværligt' },
  { value: 2, label: 'Meget besværligt' },
  { value: 3, label: 'Ekstremt besværligt' },
];

export const PHQ9_INSTRUMENT = {
  id: 'phq9', kind: 'instrument', skabelon: 'phq9',
  uiTitle: 'Humør og energi', kort: 'PHQ-9',
  stem: 'Inden for de seneste 2 uger, hvor ofte har du været generet af følgende problemer?',
  attribution: 'PHQ-9 (Spitzer, Williams, Kroenke et al.). Public domain. Gengivet med kildeangivelse.',
  options: PHQ9_INSTRUMENT_OPTS,
  scoredItems: [
    { key: 'phq9_item_1', text: 'Lille interesse i eller glæde ved at gøre ting' },
    { key: 'phq9_item_2', text: 'Følt dig nedtrykt, håbløs eller været deprimeret' },
    { key: 'phq9_item_3', text: 'Problemer med at falde i søvn eller sove, eller med at sove for meget' },
    { key: 'phq9_item_4', text: 'Følt dig træt eller har kun haft lidt energi' },
    { key: 'phq9_item_5', text: 'Ringe appetit eller spist for meget' },
    { key: 'phq9_item_6', text: 'Haft det dårligt med dig selv – eller følt, at du er en fiasko eller har skuffet dig selv eller din familie' },
    { key: 'phq9_item_7', text: 'Problemer med at koncentrere dig om ting, såsom at læse avisen eller se TV' },
    { key: 'phq9_item_8', text: 'Har bevæget dig eller talt så langsomt, at andre kunne have bemærket det? Eller det modsatte – været så rastløs eller hvileløs, at du har bevæget dig mere omkring end sædvanligt' },
    { key: 'phq9_item_9', text: 'Tanker om, at det ville være bedre, hvis du var død eller om at gøre skade på dig selv på en eller anden måde' },
  ],
  // Item 9 (selvmordstanker) > 0 -> safety-lag prominent + phq9_item9_flag til behandler.
  safetyKey: 'phq9_item_9',
  funktion: {
    key: 'phq9_funktion', optional: true,
    text: 'Hvis du har afkrydset mindst ét af de ovenstående problemer, hvor besværligt har disse problemer gjort det for dig at arbejde, klare tingene i hjemmet eller komme overens med andre?',
    options: PHQ9_FUNKTION_OPTS,
  },
  // Licens-/parathedsflag (spec §4): public domain (Pfizer 2010), verbatim verificeret.
  licensStatus: 'public-domain',
  KLAR: true,
};
// emdash-guard:instrument-end

// Kanonisk [MYCEL]-feltorden pr. skabelon (spec §3). Bruges af emitter + guard.
export function instrumentFeltOrden(skema) {
  const items = skema.scoredItems.map((it) => it.key);
  if (skema.skabelon === 'who5') return [...items, 'who5_raw', 'who5_pct'];
  if (skema.skabelon === 'phq9') return [...items, 'phq9_sum', 'phq9_item9_flag', skema.funktion.key];
  if (skema.skabelon === 'gad7') return [...items, 'gad7_sum'];   // INGEN funktion/flag (modsat PHQ-9)
  if (skema.skabelon === 'ess')  return [...items, 'ess_sum'];    // 8 items a 0-3 => 0-24
  return items;
}

// Heltal-svar (0..max) fra answers, ellers null. ALDRIG gaet/default.
function instrumentInt(answers, key) {
  const raw = answers ? answers[key] : undefined;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

// Afledte felter (ALTID beregnet, aldrig hardcodet). Manglende item -> afledt = null
// (emitteres tomt = "ikke registreret"; ingen vildledende delsum).
export function instrumentDerived(skema, answers) {
  const ints = {};
  for (const it of skema.scoredItems) ints[it.key] = instrumentInt(answers, it.key);
  const allePresent = skema.scoredItems.every((it) => ints[it.key] != null);
  const sum = allePresent ? skema.scoredItems.reduce((s, it) => s + ints[it.key], 0) : null;
  if (skema.skabelon === 'who5') {
    return { who5_raw: sum, who5_pct: (sum == null) ? null : sum * 4 };
  }
  if (skema.skabelon === 'phq9') {
    const i9 = ints[skema.safetyKey];
    return { phq9_sum: sum, phq9_item9_flag: (i9 == null) ? null : (i9 > 0) };
  }
  if (skema.skabelon === 'gad7') {
    return { gad7_sum: sum };   // sum af alle 7 (0-21); ingen flag/funktion
  }
  if (skema.skabelon === 'ess') {
    // Sum af alle 8 (0-24). Graensen >10 = »excessive daytime sleepiness« er KLINIKER-side
    // og beregnes IKKE her: klienten ser aldrig et tal eller en tolkning, og et flag i
    // konvolutten ville vaere en tolkning smuglet ind som et felt.
    return { ess_sum: sum };
  }
  return {};
}

// [MYCEL v1]-emitter for WHO-5 / PHQ-9 (kontrakt §1-konvolut + spec §3-felter). Ren tekst
// = MJ-parser-maal. Heltal eller tom streng pr. felt (tom = "ikke registreret"); afledte
// sum/pct/flag beregnes her (aldrig hardcodet). dato + ref leveres af kalderen (token-linket),
// ALDRIG today(). kilde: 'web' (fuld web-submit) | 'sms-fallback' (bevidst lossy).
export function buildInstrumentMycel(skema, answers = {}, meta = {}) {
  const ref   = (meta.ref   != null) ? String(meta.ref).trim()   : '';
  const dato  = (meta.dato  != null) ? String(meta.dato).trim()  : '';
  const kilde = (meta.kilde != null) ? String(meta.kilde).trim() : 'web';
  const derived = instrumentDerived(skema, answers);
  const linjer = [
    '[MYCEL v1]',
    'skabelon: ' + skema.skabelon,
    'klient_ref: ' + ref,
    'dato: ' + dato,
    'kilde: ' + kilde,
  ];
  for (const key of instrumentFeltOrden(skema)) {
    let ud = '';
    if (key === 'phq9_item9_flag') {
      ud = (derived.phq9_item9_flag == null) ? '' : (derived.phq9_item9_flag ? 'true' : 'false');
    } else if (Object.prototype.hasOwnProperty.call(derived, key)) {
      ud = (derived[key] == null) ? '' : String(derived[key]);
    } else {
      const v = instrumentInt(answers, key);     // item- eller funktion-felt
      ud = (v == null) ? '' : String(v);
    }
    linjer.push(key + ': ' + ud);
  }
  linjer.push('[/MYCEL]');
  return linjer.join('\n');
}

// ── GAD-7 (Generaliseret Angst, 7 items) — KLAR 2026-06-27 ───────────────────
// Verbatim modtaget fra officiel dansk phqscreeners-PDF (GAD7_Danish for Denmark.pdf);
// spec/kilde: Projekt_Praksis/noter/kat-instrument-gad7-hentning-wsas-beslutning-2026-06-27.md §1.
// Fri licens (Pfizer education grant, ingen tilladelse kraevet). INGEN funktionslinje (denne
// officielle danske version har INTET funktions-item, modsat PHQ-9 item 10) + INGEN safety-panel
// (GAD-7 har ingen suicidalitets-item, modsat PHQ-9 item 9). gad7_sum = sum af alle 7 (0-21);
// svaerhedsbaand er KLINIKER-side (ikke patient-vist). Ingen tal-badge (0-3, hoejere = vaerre).
// Marker-klausulen "et kryds" gengives som ORD, ikke "✔"-glyf: ikon/emoji-direktivet er
// UPAAVIRKET af verbatim-undtagelsen (instrumenter maa ikke baere emoji), Viktor-valg 27/6
// (konsistent med WHO-5's "et kryds i det felt"). Em-dash-reglen rorer ikke verbatim (sentinel).
// emdash-guard:instrument-start (GAD-7 public domain Spitzer/Williams/Kroenke et al.: verbatim
// gengivelse fra officiel dansk phqscreeners-PDF; em-dash-reglen gaelder IKKE inden for dette region)
export const GAD7_INSTRUMENT = {
  id: 'gad7', kind: 'instrument', skabelon: 'gad7',
  uiTitle: 'Bekymring og uro', kort: 'GAD-7',
  // Verbatim instruktion (glyf "✔" -> ord "et kryds" pr. ikon/emoji-direktiv, Viktor-valg 27/6).
  instruktion: 'Hvor ofte i de sidste 14 dage har du været generet af følgende problemer? (Marker dit svar med et kryds)',
  // Stamme echoes pr. item i ét-spørgsmål-ad-gangen-flowet (samme mønster som PHQ-9); marker-
  // klausulen gentages ikke (engangs-vejledning lever i instruktionen ovenfor).
  stem: 'Hvor ofte i de sidste 14 dage har du været generet af følgende problemer?',
  attribution: 'Spitzer, Williams, Kroenke et al., med uddannelseslegat fra Pfizer Inc.',
  options: [                                  // svarkategorier 0-3 VERBATIM (matcher PHQ-9 Danish)
    { value: 0, label: 'Slet ikke' },
    { value: 1, label: 'Flere dage' },
    { value: 2, label: 'Mere end halvdelen af dagene' },
    { value: 3, label: 'Næsten hver dag' },
  ],
  scoredItems: [                              // 7 items VERBATIM (officiel dansk PDF)
    { key: 'gad7_item_1', text: 'Følt dig nervøs, ængstelig eller anspændt' },
    { key: 'gad7_item_2', text: 'Ikke kunnet holde op med at bekymre dig eller ikke kunnet styre din bekymring' },
    { key: 'gad7_item_3', text: 'Bekymret dig for meget om alt muligt' },
    { key: 'gad7_item_4', text: 'Haft svært ved at slappe af' },
    { key: 'gad7_item_5', text: 'Været så rastløs, at du har haft svært ved at sidde stille' },
    { key: 'gad7_item_6', text: 'Haft let ved at blive sur eller irritabel' },
    { key: 'gad7_item_7', text: 'Været bange, som om noget frygteligt kunne ske' },
  ],
  // INGEN funktion, INGEN safetyKey (begge bevidst udeladt for GAD-7).
  // Licens-/parathedsflag (spec §4): public domain (Pfizer 2010), verbatim verificeret 27/6.
  licensStatus: 'public-domain',
  KLAR: true,
};
// emdash-guard:instrument-end

// ── ESS (Epworth Sleepiness Scale, 8 items) — BYGGET, IKKE GODKENDT ──────────
// Viktor-beslutning 17/8: ESS maa staa paa klientfladen (licensen daekker BYOD paa klientens
// egen telefon, Special Terms 140135), men som SEPARAT LINK og SENERE, ikke som et tredje
// trin i intake. Begrundelsen er klinisk, ikke teknisk: ubundet traekvindue + lav test-retest
// paa kort sigt + licensloft 5 administrationer pr. patient ⇒ foer/efter-maal, ikke forloebsmaal.
//
// 🔴 HVORFOR DEN ER KLAR:true OG ALLIGEVEL IKKE I INSTRUMENTER, og det er hele det nye i
// denne blok. Byg-ordrens E2 sagde: byg skaermene FOERST, skyd screenshots, indsend dem til
// Mapi/MRT, og foerst DEREFTER maa de bruges paa en aegte klient. Raekkefoelgen er omvendt af
// intuitionen: siderne skal FINDES foer godkendelsen kan soeges. Den binaere KLAR-gate kunne
// ikke baere det: KLAR:false ville betyde »ingen skaerme at fotografere«, og KLAR:true alene
// ville betyde »naabar for et klient-token«. Derfor en anden akse:
//
//   KLAR            er modulet fuldt formet (verbatim tekst, skala, items)?      -> ja
//   klientGodkendt  maa det vises for en KLIENT?                                 -> nej, endnu
//
// De to registre nedenfor laeser hver sin akse. `INSTRUMENTER` (som ?s=<skabelon>-routingen
// slaar op i) kraever BEGGE; `INSTRUMENTER_REVIEW` kraever KLAR og NAEGTER klientGodkendt.
// Et klient-link kan derfor ikke naa ESS, mens screenshot-vejen kan. Det er praecis den
// skelnen E2 bad om: »en vagt der spaerrer ubekraeftede instrumenter maa kunne skelne
// bygget-ikke-godkendt fra live«.
//
// 🔴 showValueBadge:true, og begrundelsen er en RETTELSE af den regel der staar ved WHO-5.
// Dér staar »KUN WHO-5: PHQ-9 er 0-3 hvor hoejere=vaerre -> et tal ville aktivt vildlede«.
// Den regel er formuleret paa scoringens retning, men det er ikke det tallet afhaenger af.
// ESS er ogsaa 0-3 med hoejere=vaerre, OG dens verbatim instruktion siger ordret »Brug
// nedenstaaende skala ved at vaelge det bedst passende nummer for hver situation«, og
// svar-kolonnen hedder »Sandsynlighed for, at du smaablunder (0-3)«. At skjule tallet ville
// vaere en AENDRING af instrumentet, og aendring er praecis det licensen forbyder.
// ⇒ Den baerende regel er: baerer den VERBATIM instruktion selv tallet? Saa skal det vises.
// Hoejere=bedre var et saertilfaelde af den regel, ikke reglen.
//
// VERBATIM-KILDE: soevn/ess-licens/ESS_AU1.0_dan-DK.txt (dansk ESS leveret af Mapi/ICON LS,
// gitignoreret licens-scoped mappe, ikke i repo). Instruktion, skala-ankre og alle 8
// situationer er gengivet ord-for-ord. Kolonne-layoutets efterstillede blanktegn og
// underscore-felter er sat-satsning, ikke ordlyd, og foelger ikke med.
// 🔴 Notitsen »ESS © MW Johns 1990-1997. Used under License.« er en HAARD licensbetingelse
// (Special Terms §4.4) og staar i `attribution`, som renderes baade paa spoergeskaermen
// (#instrument-attribution) og paa review-skaermen (#instrument-review-attribution).
// emdash-guard:instrument-start (ESS © MW Johns 1990-1997, Used under License, Mapi Special
// Terms 140135: dansk klient-tekst gengivet VERBATIM. Em-dash- og aeoeaa-reglen gaelder IKKE
// inden for dette region, jf. byg-ordre E2. Vores egen UI-copy ligger i index.html.)
export const ESS_INSTRUMENT = {
  id: 'ess', kind: 'instrument', skabelon: 'ess',
  // Neutral klient-titel paa siden selv (husets moenster: aldrig instrument-navnet som
  // overskrift). Instrumentets EGET verbatim navn gaar ikke tabt: det staar foerst i
  // `attribution`, saa baade den ordrette titel og copyright-notitsen er paa skaermen.
  uiTitle: 'Søvnighed i dagligdagen', kort: 'ESS',
  instruktion: 'Hvor stor er sandsynligheden for, at du småblunder eller falder i søvn i nedenstående situationer, og ikke bare føler dig træt? '
             + 'Dette refererer til din sædvanlige levevis i den seneste tid. '
             + 'Selv om du ikke har oplevet nogle af disse situationer i den seneste tid, bedes du forsøge at finde ud af, hvordan de ville have påvirket dig. '
             + 'Brug nedenstående skala ved at vælge det bedst passende nummer for hver situation. '
             + 'Det er vigtigt, at du besvarer hvert spørgsmål så godt, du kan.',
  stem: 'Hvor stor er sandsynligheden for, at du småblunder eller falder i søvn i nedenstående situationer, og ikke bare føler dig træt?',
  attribution: 'Epworth’ spørgeskema til vurdering af søvnighed (ESS). ESS © MW Johns 1990-1997. Used under License.',
  // 🔴 PROVENIENS, porteret fra forligs-grenen 22-08. Den svarer paa et spoergsmaal som
  // `klientGodkendt` ikke stiller: HVOR kom ordlyden fra? De to felter er ortogonale ,
  // eksponering og proveniens , og INFRA formulerede det skarpere end tallene kunne:
  // fjernede vi dette felt, kunne huset flippe en HAANDTASTET ordlyd til klientvendt uden
  // at noget sagde fra. Det er ikke en daarligere udgave af eksponerings-gaten, det er
  // fravaer af et andet vaern.
  //
  // Special Terms No 140135 §5, verificeret i PDF'en 20-08 (ikke i husets sammenfatning):
  //   »ICON LS is the ONLY organization authorized to perform linguistic validation/
  //    translation work on the COA«
  //   »ICON LS shall update and POPULATE the COA translations into a technical file
  //    PROVIDED BY THE USER«
  // ⇒ Teksten herunder er AFSKREVET af huset fra papirudgaven. Ordlyden er korrekt og
  // uaendret, men RUTEN er ikke den licensen beskriver. Attributionen ovenfor siger
  // »Used under License« om noget vi selv har tastet ind, og det er praecis derfor feltet
  // her skal staa ved siden af den.
  // 🔴 MAA IKKE FLIPPES TIL klientGodkendt:true PAA DENNE TEKST.
  verbatimKilde: 'AFSKRIFT af Projekt_Praksis/soevn/ess-licens/ESS_AU1.0_dan-DK.txt (dansk AU1.0). '
               + 'E-versionens ordlyd skal populeres af ICON LS i en teknisk fil vi leverer '
               + '(Special Terms 140135 §5), IKKE tages fra denne afskrift. '
               + 'Til bygning og screenshot-review, ikke til klientbrug.',
  showValueBadge: true,
  // 🔴 Copyright-notitsen skal staa paa HVERT trin, ikke kun paa det foerste. Special Terms
  // §4.4 kraever den vist hvor instrumentet optraeder, og i eet-spoergsmaal-ad-gangen-flowet
  // er trin 2 til 8 syv selvstaendige sider hvor det optraeder. Default i stepperen er
  // uaendret (kun trin 1), saa flaget koster nul for WHO-5, PHQ-9 og GAD-7.
  notitsPaaHverSide: true,
  options: [                                  // skala-ankre VERBATIM (0-3)
    { value: 0, label: 'ville aldrig småblunde' },
    { value: 1, label: 'lille sandsynlighed for, at du småblunder' },
    { value: 2, label: 'moderat sandsynlighed for, at du småblunder' },
    { value: 3, label: 'stor sandsynlighed for, at du småblunder' },
  ],
  scoredItems: [                              // 8 situationer VERBATIM, i kildens raekkefoelge
    { key: 'ess_item_1', text: 'Sidder og læser' },
    { key: 'ess_item_2', text: 'Ser fjernsyn' },
    { key: 'ess_item_3', text: 'Sidder passivt et offentligt sted (f.eks. i et teater eller til et møde)' },
    { key: 'ess_item_4', text: 'Som passager i en bil i en time uden en pause' },
    { key: 'ess_item_5', text: 'Ligger ned for at hvile om eftermiddagen, når omstændighederne tillader det' },
    { key: 'ess_item_6', text: 'Sidder og taler med nogen' },
    { key: 'ess_item_7', text: 'Sidder stille efter en frokost uden indtagelse af alkohol' },
    { key: 'ess_item_8', text: 'I en bil, mens den holder stille i nogle få minutter på grund af trafikken' },
  ],
  // INGEN funktion, INGEN safetyKey. ESS har hverken funktionslinje eller et item der
  // udloeser et sikkerhedspanel; svaerhedsbaand er KLINIKER-side og vises aldrig klienten.
  licensStatus: 'licens-gated',
  KLAR: true,
  // Den anden akse. `false` er det eneste der spaerrer, saa et modul der GLEMMER feltet
  // opfoerer sig som i dag (godkendt) frem for at forsvinde tavst fra fladen.
  klientGodkendt: false,
  godkendelse: {
    krav: 'Screenshot-review hos Mapi/MRT via ePROVIDE (Special Terms 140135 §4.3+§5, General §4.4)',
    status: 'ikke indsendt',
    naeste: 'Skyd screenshots af ALLE skaerme hvor ESS optraeder (spoergeskaerm pr. item, '
          + 'review-skaerm, kvittering) og indsend dem via ePROVIDE. Viktor-greb: kraever hans login.',
    ref: 'INSTRUMENT_LICENS.ess.betingelser',
  },
};
// emdash-guard:instrument-end

// ════════════════════════════════════════════════════════════════════════
//  SCAFFOLD-SLOTS (KLAR:false) — defineret, men IKKE eksponerbare (spec §4)
// ════════════════════════════════════════════════════════════════════════
// Et instrument-modul kan defineres FØR dets licens + verbatim er på plads. Slottet
// registrerer KUN mønsteret + licensStatus; item-teksten forbliver TOM (scoredItems: [])
// indtil den verbatim kilde lander. Reglen: ALDRIG gættede/fabrikerede items i et klinisk
// skema. KLAR:false → slottet når ALDRIG ind i INSTRUMENTER (gated loop nedenfor) → et
// single-token ?s=<skabelon> rammer det ikke → uekssponerbar i preview og prod. Når licens
// + verbatim lander: indsæt verbatim items (sentinel-omkranset) + flip KLAR:true. Nul
// genbygning, nul fabrikation. Dette generaliserer Viktors "klar til at tage dem ind senere".

// CAS-1 — licens-gated (MCT-Institute, kommerciel app-indlejring = Viktor-beslutning).
// Venter på: licens-svar + Viktor 3-linse af nyt CAS-1-arbejde (eget spor, ikke denne branch).
export const CAS1_INSTRUMENT_SLOT = {
  id: 'cas1', kind: 'instrument', skabelon: 'cas1',
  uiTitle: '', kort: 'CAS-1',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'licens-gated',
  KLAR: false,
};

// WSAS — afventer e-kommerciel licens (ePROVIDE) + dansk verbatim.
export const WSAS_INSTRUMENT_SLOT = {
  id: 'wsas', kind: 'instrument', skabelon: 'wsas',
  uiTitle: '', kort: 'WSAS',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'afventer',
  KLAR: false,
};

// WHODAS 2.0 — afventer WHO portal-licens + dansk verbatim.
export const WHODAS_INSTRUMENT_SLOT = {
  id: 'whodas', kind: 'instrument', skabelon: 'whodas',
  uiTitle: '', kort: 'WHODAS 2.0',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'afventer',
  KLAR: false,
};


// ════════════════════════════════════════════════════════════════════════
//  MASKINEL LICENS-GATE (spec §4 KLAR-reglen + §5 extensibilitets-beskyttelse)
// ════════════════════════════════════════════════════════════════════════
// Alle instrument-moduler (aktive + scaffold-slots) i ÉN liste. Registrering i INSTRUMENTER
// er GATED på KLAR: kun KLAR:true når ind → kun de kan rammes af et single-token ?s=<skabelon>
// (routing slår op i INSTRUMENTER, se index.html). Et licens-pending (KLAR:false) instrument
// kan derfor ALDRIG lække til preview/prod, uanset hvad et token siger. Dette generaliserer
// det tidligere GAD7_INSTRUMENT_KLAR-mønster til ALLE instrumenter. Guard: test/instrument-
// klar-gate.mjs asserterer at intet KLAR:false-modul er i INSTRUMENTER eller routing.
// ISI: licensen ER i hus (to sager, begge Free of charge, 20-08), men ordlyden er IKKE
// transskriberet. Slottet findes fordi `licens-profil-gate` med rette afviser en licensraekke
// uden et instrument: raekken i INSTRUMENT_LICENS pegede paa noget der ikke fandtes.
// 🔴 items er TOMME med vilje. Fire varianter ligger paa disk (to sprog x to recall-vinduer),
// og hvilken der er den primaere paa fladen, er en klinisk beslutning frem for en oprydning.
// Sammenlign ESS-slottet, som HAR sin verbatim: forskellen er ikke licensen, men at nogen
// har valgt versionen.
export const ISI_INSTRUMENT_SLOT = {
  id: 'isi', kind: 'instrument', skabelon: 'isi',
  uiTitle: '', kort: 'ISI',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst: versionsvalget mangler, ikke licensen
  verbatimKilde: 'Projekt_Praksis/soevn/isi-licens/ (4 varianter: dan-DK og eng, '  // nudansk-guard:allow: FILSTI paa disk: mappen HEDDER soevn/isi-licens/
               + 'last-2-weeks og last-month, plus ISI Users Manual)',  // nudansk-guard:allow: recall-vinduernes EGNE engelske navne i Mapis filnavne (last-2-weeks, last-month)
  licensStatus: 'i-hus-afventer-flade',
  KLAR: false,
};

export const INSTRUMENT_MODULER = [
  WHO5_INSTRUMENT, PHQ9_INSTRUMENT, GAD7_INSTRUMENT,                  // KLAR:true  (aktiv)
  ESS_INSTRUMENT,                                                     // KLAR:true, klientGodkendt:false
  CAS1_INSTRUMENT_SLOT, WSAS_INSTRUMENT_SLOT, WHODAS_INSTRUMENT_SLOT, // KLAR:false (scaffold)
  ISI_INSTRUMENT_SLOT,                                                // KLAR:false (licens i hus, ordlyd ikke valgt)
];

// Er modulet fuldt formet OG godkendt til at blive vist for en klient? Feltet `klientGodkendt`
// spaerrer KUN naar det staar eksplicit `false`: et modul der ikke kender feltet opfoerer sig
// som foer (godkendt). Et manglende felt maa aldrig kunne fjerne et instrument tavst fra
// Viktors flade - fail-closed hoerer til produktet, ikke til installationen (samme skel som
// `allowlistFor` ovenfor).
export function maaVisesForKlient(modul) {
  return modul.KLAR === true && modul.klientGodkendt !== false;
}

// SEPARAT register (IKKE SKEMAER - undgaar kollision med batteri-noeglerne who5/phq9).
// Dette er det register `?s=<skabelon>`-routingen slaar op i. Et instrument der ikke staar
// her, kan ikke naas af noget klient-link, uanset hvad tokenet siger.
export const INSTRUMENTER = {};
for (const modul of INSTRUMENT_MODULER) {
  if (maaVisesForKlient(modul)) INSTRUMENTER[modul.skabelon] = modul;   // maskinel licens-gate
}

// ── DET TREDJE RUM: bygget, ikke godkendt ───────────────────────────────────
// Instrumenter der ER fuldt formede, men hvis licens kraever en godkendelse foer en klient
// maa se dem. De skal kunne RENDRES for at blive fotograferet (screenshot-review er selv
// betingelsen), og de maa ALDRIG kunne naas af et klient-link. Registret er derfor adskilt,
// og index.html kraever en eksplicit review-parameter OG fravaer af et ingest-token for at
// slaa op i det. To noegler, hver med sin egen doer.
export const INSTRUMENTER_REVIEW = {};
for (const modul of INSTRUMENT_MODULER) {
  if (modul.KLAR === true && modul.klientGodkendt === false) INSTRUMENTER_REVIEW[modul.skabelon] = modul;
}

// URL-parameteren der aabner review-visningen. Lang og eksplicit med vilje: den skal ikke
// kunne rammes ved et uheld, og den skal kunne ses i en URL af den der tager screenshottet.
export const REVIEW_PARAM = 'godkendelsesreview';

// ════════════════════════════════════════════════════════════════════════
//  SEND-KVITTERING + "Send sikkert"-CTA (besked-track K1P1 FASE B, K3+K4)
// ════════════════════════════════════════════════════════════════════════
// Nordstjerne: klienten ser samme kvittering overalt, aldrig tal. Én fælles
// PRIMÆR kvittering for alle auto-send-flows (batteri/screening/dagbog/baseline);
// de to FLOW-SPECIFIKKE kliniske forsikringer bevares som SEKUNDÆR linje kun på
// deres eget flow (Viktor-beslutning V-6, 15/7: "behold som sekundær linje").
// Term = "din psykolog" (Viktor 15/7, surface-konsistent — hele fladen bruger
// "psykolog", ikke "behandler"). Kun ren copy her; DOM-render lever i index.html
// (visSendtKvittering) så samme komponent bruges alle steder (K3 = én genbrugelig).
export const SENDT_KVITTERING_PRIMAER = 'Dine svar er sendt sikkert og krypteret til din psykolog. Tak!';
export const SENDT_KVITTERING_VERSION = '2026-07-15';

// K4: den ene primære sikker-send-knap. Vises KUN når linket faktisk auto-sender
// krypteret (autoSendEnabled) — ellers præcis, beskrivende fallback-tekst i
// index.html. "Send sikkert" er en sikkerheds-påstand: den skal være sand.
export const SEND_SIKKERT_CTA = 'Send sikkert';

// Flow-specifik SEKUNDÆR forsikringslinje (V-6). Kendte flow-nøgler:
//   'soevn-screening'        → beroliger håndoff til søvndagbogen
//   'soevndagbog-opdatering' → ikke-terminal ugentlig opdatering, forløbet fortsætter
// Alle andre flows (batteri, soevndagbog terminal, soevn-baseline, ukendt) → null.
export function sendtKvitteringSekundaer(flow) {
  switch (flow) {
    case 'soevn-screening':        return 'Du kan roligt gå i gang med din søvndagbog med det samme.';
    case 'soevndagbog-opdatering': return 'Du kan roligt fortsætte dagbogen.';
    default:                       return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
//  FORMULERING (Wells-model, s=formulering) - katalog + fragment-parser
// ════════════════════════════════════════════════════════════════════════
// Linket bygges Python-side (journal.formulering_link) som et URL-FRAGMENT
// (#<32hex-token>;s=formulering;n=..;tr=..;..), IKKE et query-param - payload
// rører aldrig serveren (GDPR). Denne sektion er parse + katalog ONLY; den
// animerede DOM-builder (renderFormulering) + index.html-dispatch er en
// separat, senere opgave. Krypto (PINNED_KEY_ID/PINNED_PUBKEY ovenfor)
// røres ikke af formulering-modus.

// Kort URL-nøgle → kanonisk feltnavn.
export const FORMULERING_NOEGLER = {
  tr: 'trigger',
  t1: 'type1_worry',
  em: 'emotion_symptomer',
  nu: 'neg_metabeliefs_ukontrollerbarhed',
  nf: 'neg_metabeliefs_fare',
  po: 'positive_metabeliefs',
  t2: 'type2_worry',
  ad: 'adfaerd',
  tk: 'tankekontrol',
};

// Klient-synlige danske bokstitler (G1: ukontrollerbarhed før fare).
export const FORMULERING_BOKS_TITLER = {
  trigger: 'Udløser',
  positive_metabeliefs: 'Positive metaantagelser (strategivalg)',
  type1_worry: 'Type 1-bekymring',
  neg_metabeliefs_ukontrollerbarhed: 'Negative metaantagelser: ukontrollerbarhed',
  neg_metabeliefs_fare: 'Negative metaantagelser: fare',
  type2_worry: 'Type 2-bekymring (metabekymring)',
  adfaerd: 'Adfærd',
  tankekontrol: 'Tankekontrol',
  emotion_symptomer: 'Følelse og symptom',
};

// Visnings-rækkefølge for de 9 bokse.
export const FORMULERING_REKKEFOELGE = [
  'trigger',
  'positive_metabeliefs',
  'type1_worry',
  'neg_metabeliefs_ukontrollerbarhed',
  'neg_metabeliefs_fare',
  'type2_worry',
  'adfaerd',
  'tankekontrol',
  'emotion_symptomer',
];

// 4 navngivne vedligeholdelses-sløjfer (verbatim dansk gloss).
export const FORMULERING_SLOEJFER = [
  { id: 1, tekst: 'Jo mere du bekymrer dig, jo flere ting begynder at ligne noget at bekymre sig om, så bekymringen giver næring til sig selv.' },
  { id: 2, tekst: 'Når du bliver bange for selve bekymringen, stiger uroen i kroppen, og de kropslige tegn tolkes som bevis på at bekymringen er farlig. Det bekræfter frygten.' },
  { id: 3, tekst: 'Fordi katastrofen udebliver, tænker du at det var fordi du passede på, ikke fordi faren aldrig var reel. Så antagelsen om at bekymring beskytter dig, får aldrig lov at blive modbevist.' },
  { id: 4, tekst: 'Når du prøver at skubbe bekymringen væk eller diskutere med den, dukker den bare op igen, og det føles som bevis på at du ikke kan styre den.' },
];

/// Strip leading '#', split token fra params. Værdier forbliver RAW
/// (stadig percent-encoded) - decodeURIComponent sker i parseFelter.
export function parseFormuleringFragment(hash) {
  const raad = (hash || '').replace(/^#/, '');
  const dele = raad.split(';');
  const token = dele[0] || '';
  const params = {};
  for (let i = 1; i < dele.length; i++) {
    const del = dele[i];
    if (!del) continue;
    const idx = del.indexOf('=');
    if (idx === -1) { params[del] = ''; continue; }
    const key = del.slice(0, idx);
    const val = del.slice(idx + 1);
    params[key] = val;
  }
  return { token, params };
}

/// Byg de 9 bokse i FORMULERING_REKKEFOELGE-orden fra rå params
/// (kort URL-nøgler → decodeURIComponent, FULD tekst, ingen afkortning).
export function parseFelter(params) {
  const bokse = [];
  for (const felt of FORMULERING_REKKEFOELGE) {
    const kort = Object.keys(FORMULERING_NOEGLER).find(k => FORMULERING_NOEGLER[k] === felt);
    const raw = kort != null ? params[kort] : undefined;
    let vaerdi = '';
    if (raw != null) { try { vaerdi = decodeURIComponent(raw); } catch (e) { vaerdi = raw; } }
    bokse.push({
      felt,
      titel: FORMULERING_BOKS_TITLER[felt],
      vaerdi,
      liste: felt === 'adfaerd' || felt === 'tankekontrol',
    });
  }
  return bokse;
}

// Formulering-UI-strenge (klient-synlige, inline i renderFormulering). Samlet HER
// (ikke i index.html) fordi core.js er em-dash-guarded (jf. EMDASH_GUARDED_FILES);
// test/formulering.mjs dash-checker Object.values(FORMULERING_UI).
export const FORMULERING_UI = {
  titel: 'Sådan kan bekymring hænge sammen',
  hint: 'Dette er et opdigtet eksempel til at vise, hvordan tanker, følelser og adfærd kan '
    + 'hænge sammen, ikke en beskrivelse af dig eller en diagnose. Læg mærke til pilene mellem boksene: '
    + 'det er sammenhængen, der er det vigtige, ikke hver boks for sig.',
  ikkeUdfyldt: 'ikke udfyldt',
  sloejferOverskrift: 'Hvad pilene betyder',
};

// Cross-repo parity-anker: EKSAKT byte-lig med Python-siden
// (journal.formulering_link.GOLDEN_FRAGMENT). Ændres KUN i lockstep begge steder.
export const FORMULERING_GOLDEN_FRAGMENT = '0123456789abcdef0123456789abcdef;s=formulering;n=Eksempel;tr=Hvad%20nu%20hvis%20jeg%20har%20glemt%20noget%20vigtigt%3F;t1=tanker%20om%20alt%20det%20der%20kan%20g%C3%A5%20galt%20i%20morgen;em=uro%20i%20maven%2C%20sp%C3%A6ndte%20skuldre%2C%20sv%C3%A6rt%20ved%20at%20slappe%20af;nu=jeg%20kan%20ikke%20stoppe%20bekymringen%2C%20n%C3%A5r%20den%20f%C3%B8rst%20er%20i%20gang;nf=hvis%20jeg%20bliver%20ved%2C%20kan%20jeg%20br%C3%A6nde%20helt%20sammen;po=hvis%20jeg%20bekymrer%20mig%20nok%2C%20er%20jeg%20forberedt%20og%20undg%C3%A5r%20problemer;t2=det%20er%20farligt%20at%20min%20bekymring%20bare%20k%C3%B8rer%20af%20sig%20selv;ad=tjekker%20ting%20flere%20gange%3B%20s%C3%B8ger%20beroligelse%20hos%20andre;tk=pr%C3%B8ver%20at%20skubbe%20tankerne%20v%C3%A6k%3B%20sk%C3%A6lder%20mig%20selv%20ud%20for%20at%20t%C3%A6nke%20s%C3%A5dan';

// ════════════════════════════════════════════════════════════════════════
//  FORMULERING — animeret DOM-builder (Task 9). Rent browser-only (document.*),
//  ingen node-DOM-test (verificeres via See-it). Krypto UBERØRT (PINNED_KEY_ID/
//  PINNED_PUBKEY ovenfor). ALLE klient-synlige danske strenge bor HER (core.js
//  er em-dash-guarded, jf. EMDASH_GUARDED_FILES) — index.html må ikke bære
//  ny klient-copy for denne flade.
// ════════════════════════════════════════════════════════════════════════
//
// Fidelitets-invarianter (LÅST, fra klinisk kilde):
//  - Rækkefølge = FORMULERING_REKKEFOELGE (G1: ukontrollerbarhed FØR fare).
//  - Fuld tekst, INGEN afkortning (ingen "…").
//  - Positive/negative metaantagelser i TYDELIGT forskellige dissonans-farver.
//  - Følelse/symptom er INTERMITTERENDE (refinement 3) — ikke en monoton stigning.
//  - reduced-motion → samme fulde model, ingen bevægelse (statisk).
//
// Flow-pile (klinisk finpuds): hint-teksten lover "pilene mellem boksene" -
// buildFlowPil() tegner en dekorativ, nedadgående SVG-pil (EGET ikon, ingen emoji,
// intet unicode-pil-tegn) mellem hvert par af de 9 bokse, så modellens fremadrettede
// flow (udløser -> ... -> følelse) er visuelt eksplicit, ikke kun impliceret af rækkefølgen.
function buildFlowPil(delaySekunder) {
  const wrap = document.createElement('div');
  wrap.className = 'gadanim-arrow';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.animationDelay = delaySekunder + 's';
  wrap.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M12 4v13"/><path d="M6 12l6 6 6-6"/></svg>';
  return wrap;
}

export function renderFormulering(params, mount) {
  if (!mount) return;
  mount.innerHTML = '';

  let navn = '';
  if (params && params.n) { try { navn = decodeURIComponent(params.n); } catch (e) { navn = params.n; } }
  const h1 = document.createElement('h1');
  h1.textContent = FORMULERING_UI.titel + (navn ? ', ' + navn : '');
  mount.appendChild(h1);

  const hint = document.createElement('p');
  hint.className = 'gadanim-hint';
  hint.textContent = FORMULERING_UI.hint;
  mount.appendChild(hint);

  const nodesWrap = document.createElement('div');
  nodesWrap.className = 'gadanim-nodes';
  mount.appendChild(nodesWrap);

  const bokse = parseFelter(params || {});
  bokse.forEach((b, i) => {
    const sec = document.createElement('section');
    sec.className = 'gadanim-node';
    if (b.felt === 'positive_metabeliefs') sec.classList.add('pos');
    if (b.felt === 'neg_metabeliefs_ukontrollerbarhed' || b.felt === 'neg_metabeliefs_fare') sec.classList.add('neg');
    if (b.felt === 'emotion_symptomer') sec.classList.add('gadanim-emotion');
    sec.style.animationDelay = (i * 0.45) + 's';

    const h2 = document.createElement('h2');
    h2.textContent = b.titel;
    sec.appendChild(h2);

    const p = document.createElement('p');
    p.textContent = b.vaerdi || FORMULERING_UI.ikkeUdfyldt;
    sec.appendChild(p);

    nodesWrap.appendChild(sec);

    if (i < bokse.length - 1) {
      nodesWrap.appendChild(buildFlowPil((i + 0.5) * 0.45));
    }
  });

  const sloejferSec = document.createElement('section');
  sloejferSec.className = 'gadanim-sloejfer';
  const sloejferH2 = document.createElement('h2');
  sloejferH2.textContent = FORMULERING_UI.sloejferOverskrift;
  sloejferSec.appendChild(sloejferH2);

  const ul = document.createElement('ul');
  FORMULERING_SLOEJFER.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s.tekst;
    ul.appendChild(li);
  });
  sloejferSec.appendChild(ul);
  mount.appendChild(sloejferSec);
}
