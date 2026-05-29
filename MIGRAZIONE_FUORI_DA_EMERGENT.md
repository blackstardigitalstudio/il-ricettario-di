# Il Ricettario di Casa — Guida alla migrazione fuori da Emergent

Questa guida ti porta dall'app legata a Emergent a un'app **completamente indipendente e gratuita**:
backend self-hosted su **Render** + database **MongoDB Atlas** + IA tramite **Google Gemini** (piano gratuito),
e un **APK Android** generato con EAS Build.

Tutto ciò che riguarda Emergent è stato rimosso dal codice. Restano solo da configurare i servizi gratuiti qui sotto.

---

## Architettura (perché serve un piccolo server)

L'app NON può girare interamente sul telefono: lo scaricamento dei video (yt-dlp), l'estrazione dei
fotogrammi (ffmpeg) e lo scraping delle didascalie (instaloader) richiedono un server. La soluzione gratuita:

- **Backend** (FastAPI) → ospitato su **Render** (piano free, Docker)
- **Database** → **MongoDB Atlas** (piano free M0)
- **IA** → **Google Gemini** `gemini-2.5-flash` via API ufficiale (piano free generoso)
- **App** → APK Android che punta all'URL del backend su Render

---

## 1) Chiave IA gratuita — Google Gemini

1. Vai su https://aistudio.google.com/apikey (accedi con un account Google).
2. Clicca **Create API key** → copia la chiave (inizia con `AIza...`).
3. Tienila da parte: sarà la variabile `GEMINI_API_KEY` su Render.

Il piano gratuito di Gemini è sufficiente per l'uso personale dell'app.

---

## 2) Database gratuito — MongoDB Atlas

1. Crea un account su https://www.mongodb.com/cloud/atlas/register
2. Crea un cluster **M0 (Free)**.
3. **Database Access** → crea un utente con password (annota username e password).
4. **Network Access** → aggiungi `0.0.0.0/0` (permette a Render di connettersi).
5. **Connect → Drivers** → copia la connection string, simile a:
   ```
   mongodb+srv://UTENTE:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Sostituisci `UTENTE` e `PASSWORD` con i tuoi. Questa è la variabile `MONGO_URL`.

---

## 3) Backend su Render

Il repo contiene già tutto il necessario: `backend/Dockerfile`, `backend/.dockerignore` e `render.yaml`.

1. Crea un account su https://render.com (puoi accedere con GitHub).
2. **New → Blueprint** e seleziona il repository `il-ricettario-di`.
   Render leggerà automaticamente `render.yaml` e creerà il servizio `ricettario-backend`.
3. Quando richiesto, imposta le variabili d'ambiente **segrete** (`sync: false`):
   - `MONGO_URL` → la connection string di Atlas (punto 2)
   - `GEMINI_API_KEY` → la chiave di Gemini (punto 1)
   - `IG_COOKIE_KEY` → chiave per cifrare i cookie Instagram. Generala così (in locale, con Python):
     ```python
     from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())
     ```
     Incolla il risultato come valore. (Serve solo per le funzioni Instagram; un valore valido è comunque richiesto.)
   - `DB_NAME` e `GEMINI_MODEL` sono già preimpostati in `render.yaml` (`ricettario` / `gemini-2.5-flash`).
4. Avvia il deploy. Al termine Render ti darà un URL pubblico, tipo:
   ```
   https://ricettario-backend.onrender.com
   ```
   Annotalo (senza slash finale).

> Nota piano free Render: il servizio va in "sleep" dopo inattività; la prima richiesta dopo una pausa
> può impiegare ~30-60 secondi a rispondere. È normale.

---

## 4) Collega l'app al backend

Apri `frontend/.env` e assicurati che l'URL corrisponda **esattamente** a quello di Render (punto 3):

```
EXPO_PUBLIC_BACKEND_URL=https://ricettario-backend.onrender.com
```

Niente slash finale. Questo valore viene incorporato nell'APK al momento della build.

---

## 5) Genera l'APK con EAS Build

Prerequisiti: Node.js installato e un account Expo gratuito (https://expo.dev).

```powershell
cd "D:\app ricette\ricettario\frontend"
npm install
npm install -g eas-cli          # se non già installato
eas login                       # accedi con l'account Expo
eas build -p android --profile preview
```

Il profilo `preview` (in `eas.json`) produce un **APK** installabile.
Al termine EAS fornisce un link da cui scaricare il file `.apk`: trasferiscilo sul telefono e installalo
(abilitando "Installa da origini sconosciute" se richiesto).

> In alternativa, build locale (richiede Android SDK installato):
> `eas build -p android --profile preview --local`

---

## 5-bis) Genera il bundle .aab per il Play Store

L'APK del punto 5 serve per installare e provare l'app a mano. Per **pubblicare sul Google
Play Store** serve invece un **Android App Bundle (.aab)**, prodotto dal profilo `production`
(già configurato in `eas.json` con `buildType: "app-bundle"`):

```powershell
cd "D:\app ricette\ricettario\frontend"
eas build -p android --profile production
```

Al termine EAS fornisce il file `.aab` da caricare nella Google Play Console
(Crea app → Produzione → Carica bundle).

Note importanti per il Play Store:
- Il profilo `production` ha `autoIncrement: true`: a ogni build EAS incrementa da solo il
  `versionCode`, come richiesto da Google.
- **Firma**: per il Play Store conviene lasciare che sia EAS a gestire la keystore di firma
  (alla prima build production EAS chiede se generarne una — rispondi sì e conservala).
  La `debug.keystore` presente in `android/app` va bene solo per APK di prova, NON per il Play Store.
- Poiché il nome pacchetto è cambiato in `studio.blackstardigital.ilricettario`, sul Play Store
  sarà una **scheda app nuova**: crea una nuova app nella Console e collega il tuo ID AdMob.

---

## 6) Salva le modifiche su GitHub

```powershell
cd "D:\app ricette\ricettario"
git add -A
git commit -m "Rimuove Emergent: backend self-hosted (Render+Atlas) e IA Gemini gratuita"
git push origin main
```

---

## Riepilogo modifiche già fatte nel codice

- **Backend**: rimossa la libreria `emergentintegrations`; nuovo helper `backend/services/llm.py`
  che usa direttamente Google Gemini. Aggiornati `ai.py`, `routes/shopping.py`, `config.py`.
- **Deploy**: aggiunti `backend/Dockerfile`, `backend/.dockerignore`, `backend/.env.example`, `render.yaml`.
- **App**: nome pacchetto rinominato in `studio.blackstardigital.ilricettario`
  (app.json, android/build.gradle, file Kotlin spostati e aggiornati, link Play Store).
- **Config**: creato `frontend/.env` con l'URL del backend.
- Rimosso il file residuo `.gitconfig` con identità Emergent.

### Miglioramenti UI / bug tema (questa sessione)
- **Bug tema chiaro/scuro risolto su tutte le pagine.** Diverse schermate non cambiavano
  colore perché usavano stili "dark" fissi invece di quelli reattivi al tema:
  - `recipe/[id].tsx`, `shopping-list.tsx`, `folders.tsx` calcolavano gli stili tema ma poi
    nel render usavano per errore gli stili fissi scuri → ora collegati al tema live.
  - `_layout.tsx` (root): `StatusBar` e sfondo ora seguono il tema (prima sempre scuri);
    anche la schermata di benvenuto e il caricamento iniziale.
  - `(drawer)/_layout.tsx`: sfondo del menu laterale ora segue il tema (prima fisso `#141414`).
  - `web-downloader.tsx` e `folder/[id].tsx`: convertiti al tema (prima interamente scuri).
  - Frecce "indietro" bianche su sfondo chiaro (invisibili in light mode) corrette in più header.
- **"Made in Italy"** aggiunto come segno distintivo: in fondo al menu laterale e nella sezione
  Info delle Impostazioni, con tricolore essenziale e stile pulito/neutro.
- Corretta la versione mostrata in Impostazioni (`v1.0.0` → `v1.0.23`, allineata a `app.json`).

### Cose da sapere
- Il **nome pacchetto è cambiato**: ai fini di Google Play / AdMob è una app "nuova".
  Se vuoi pubblicarla, dovrai creare una nuova scheda Play Store e associare il tuo ID AdMob.
- I file `memory/`, `test_result.md`, `test_reports/` sono documenti/artefatti generati a suo tempo da
  Emergent: non hanno alcun collegamento al server e puoi cancellarli se vuoi ripulire il repo.
- La cartella `frontend/.metro-cache/` è solo cache di build: puoi eliminarla, si rigenera da sola.
