# Opleverpunten

Webapp voor tussentijdse opnames en eindopnames in de utiliteitsbouw. Je maakt een project aan en loopt door het gebouw. Elk opleverpunt leg je vast met een foto, en uit alle punten maak je een PDF-verslag.

De app is gemaakt voor een tablet: grote knoppen, de cameraknop binnen bereik van je duim, en hij werkt ook zonder internet.

## Functies

- **Projecten** met projectnummer, adres, opdrachtgever, aannemer en architect.
- **Opnames per rondgang**: vooropname, tussentijdse opname, eindopname, heropname en opname einde onderhoudstermijn. Nieuwe punten komen in de *actieve* opname.
- **Opleverpunten vastleggen**
  - De camera opent direct, en je kunt meerdere foto's per punt maken.
  - Op de foto markeer je met een cirkel, pijl, rechthoek of vrije lijn, in vier kleuren. Markeringen zijn later nog aan te passen.
  - Snelle teksten zoals "Kras", "Kitvoeg ontbreekt" of "Schilderwerk bijwerken".
  - Bouwlaag en ruimte worden onthouden voor het volgende punt.
  - Per punt: verantwoordelijke partij, categorie, prioriteit, status (open / gereed / akkoord), "gereed vóór"-datum en een opmerking.
  - Met **Opslaan + volgende foto** loop je in één beweging door naar het volgende punt.
- **Plattegronden**: upload een afbeelding of PDF-tekening (een PDF met meerdere pagina's wordt per blad ingelezen) en prik elk punt op de juiste plek.
- **Puntenlijst** met zoeken, filters (status, opname, bouwlaag, verantwoordelijke) en de status direct aan te passen vanuit de lijst.
- **Handtekeningen** van opdrachtgever en aannemer, op het tablet gezet.
- **PDF-verslag** met:
  - een voorblad met logo, projectgegevens, aanwezigen en een samenvatting per status en per partij
  - een overzichtslijst
  - plattegronden met genummerde, gekleurde markeringen
  - een pagina per punt met foto's in drie formaten (groot, normaal, compact)
  - de ondertekening
  - optioneel groepering op bouwlaag of verantwoordelijke, en eerdere opnames meenemen
  - downloaden, of op de tablet direct delen via mail of WhatsApp
- **Export**: puntenlijst als CSV voor Excel. Backup (JSON) per project of van alles, terug te zetten op elk apparaat.

## Waar staan de gegevens?

Alles staat **lokaal op het apparaat**, in de browser (IndexedDB), en er is geen server nodig. Daarom:

- Maak regelmatig een backup via *Instellingen → Backup van alles*, zeker vóór je browsergegevens wist of van tablet wisselt.
- Installeer de app op het beginscherm (zie hieronder) en tik in Instellingen op *Opslag beschermen*, zodat de browser niets opruimt bij ruimtegebrek.
- Foto's worden bij het maken verkleind tot maximaal 1800 px (ongeveer 300 kB). Een project met 300 foto's neemt zo rond de 100 MB in beslag.

## Starten

Het zijn alleen statische bestanden zonder build-stap. Voor de camera en de offline-werking is **HTTPS** nodig (of `localhost`).

Lokaal testen:

```bash
cd opleverpunten
```

```bash
python3 -m http.server 8080
```

Open daarna http://localhost:8080.

Online zetten kan bij elke statische host, zoals GitHub Pages, Netlify, Cloudflare Pages of een eigen webserver. Upload de map zoals hij is.

### Installeren op de tablet

- **iPad (Safari)**: open de site → deelknop → *Zet op beginscherm*.
- **Android (Chrome)**: open de site → menu ⋮ → *App installeren*.

De app opent dan schermvullend en werkt ook zonder internet.

## Opbouw

```
index.html              schil van de app
css/app.css             vormgeving (licht en donker)
js/app.js               schermen en navigatie
js/db.js                opslag (IndexedDB)
js/draw.js              foto markeren, handtekening, plattegrond
js/report.js            PDF-verslag (jsPDF) en CSV
js/images.js            foto's verkleinen, PDF-tekeningen inlezen (pdf.js)
js/sample.js            voorbeeldproject
js/constants.js         keuzelijsten en standaardteksten
sw.js                   offline-cache
vendor/                 jsPDF 2.5.2 en pdf.js 3.11.174 (MIT / Apache-2.0)
```

## Mogelijke uitbreidingen

- Synchronisatie tussen apparaten en collega's (bijvoorbeeld met Supabase of Firebase), zodat een aannemer punten online op "gereed" kan zetten.
- Een uitnodigingslink per partij waarmee die alleen de eigen punten ziet.
- Een eigen huisstijl of template voor het verslag (Word-export).
- Spraak-naar-tekst voor de omschrijving.
