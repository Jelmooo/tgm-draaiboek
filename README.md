# 🎭 TGM Draaiboek

Een simpel, overzichtelijk takenoverzicht voor de toneelgroep. Geen accounts, geen gedoe:
iedereen die de pagina opent ziet hetzelfde draaiboek. Bedoeld om lokaal te draaien op een
CasaOS-systeem, met alle data lokaal opgeslagen in één JSON-bestand.

## Wat kan het?

- **Homescreen met sectoren** — Decorcommissie, Grime, Social media, Bestuur, … zelf toe te voegen.
- **Taken per sector** met:
  - verantwoordelijke (wie pakt het op)
  - deadline (met markering als iets te laat is)
  - prioriteit: **Hoog / Middel / Laag**, met duidelijke kleuren
  - status: **Nog niet begonnen / Bezig / Klaar**
- **Subtaken** (bijv. Achterwand → Maken, Verven, Behangen) die samen een **voortgangsbalk** vormen.
- Per sector zie je in één oogopslag hoeveel procent klaar is.

## Hoe het werkt (techniek)

- Eén klein Node/Express-servertje serveert zowel de website als een simpele API.
- Alle data staat in **`<DATA_DIR>/draaiboek.json`**. Dat bestand kun je gewoon openen,
  kopiëren of back-uppen. Geen database-engine nodig.
- De frontend is gewone HTML/CSS/JS — geen build-stap.

## Lokaal draaien (om te testen)

```bash
npm install
npm start
```

Open daarna http://localhost:3000. De data komt in de map `./data/`.

Een andere poort of datalocatie? Gebruik omgevingsvariabelen:

```bash
PORT=8095 DATA_DIR=/pad/naar/data npm start
```

## Draaien op CasaOS (Docker)

### Optie A — via docker compose (aanbevolen)

1. Zet deze map op je CasaOS-systeem (bijv. via Samba of `git clone`).
2. Bouw en start:

   ```bash
   docker compose up -d --build
   ```

3. Open `http://<ip-van-je-server>:8095`.

De data wordt bewaard in `/DATA/AppData/tgm-draaiboek` op de host (zie `docker-compose.yml`).
Die map kun je aanpassen naar wens.

### Optie B — handmatig met Docker

```bash
docker build -t tgm-draaiboek .
docker run -d --name tgm-draaiboek \
  -p 8095:3000 \
  -v /DATA/AppData/tgm-draaiboek:/data \
  --restart unless-stopped \
  tgm-draaiboek
```

### Optie C — toevoegen via de CasaOS-app ("Custom Install")

In de CasaOS-app-store kun je via **+ → Install a customized app** zelf een container toevoegen:

| Veld          | Waarde                                   |
|---------------|------------------------------------------|
| Image         | `tgm-draaiboek:latest` (eerst zelf bouwen) |
| Web UI Port   | host `8095` → container `3000`           |
| Volume        | host `/DATA/AppData/tgm-draaiboek` → container `/data` |
| Environment   | `PORT=3000`, `DATA_DIR=/data`            |

> Tip: CasaOS gebruikt het opgegeven volume zodat je taken bewaard blijven, ook na een
> herstart of update van de container.

## Back-up

Wil je een back-up? Kopieer simpelweg het bestand `draaiboek.json` uit je datamap.
Terugzetten = het bestand terugplaatsen en de container herstarten.

## Eerste keer opstarten

Bij de allereerste start wordt er één voorbeeldsector (**Decorcommissie**) met een
voorbeeldtaak (**Achterwand**) aangemaakt, zodat je meteen ziet hoe het werkt. Je kunt die
gewoon aanpassen of verwijderen.
