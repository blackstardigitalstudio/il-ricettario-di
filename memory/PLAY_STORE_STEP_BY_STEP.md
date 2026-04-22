# 🚀 GUIDA COMPLETA: Pubblicare "Il Ricettario" su Google Play Store

## 📋 ORDINE DEI PASSAGGI

```
1. Generare il file .aab (dal tuo PC)  →  15-20 min
2. Pubblicare la Privacy Policy        →   5 min
3. Creare app su Play Console          →   3 min
4. Compilare la "Scheda del Play Store" →  10 min
5. Compilare "Contenuti dell'app"       →  15 min (questionari)
6. Caricare il file .aab (Release)     →   5 min
7. Submit per la review                →   click finale
```
Tempo totale: **~1 ora**. Review da Google: **3-7 giorni**.

---

## PASSO 1 — Genera il file .aab

### 1.1 Prerequisiti sul PC
- Node.js 20+ installato: https://nodejs.org
- Account Expo creato gratis: https://expo.dev/signup

### 1.2 Comandi

```bash
# 1. Clona il progetto (se non già fatto)
git clone <url-del-tuo-repo>
cd <progetto>/frontend

# 2. Installa dipendenze
npm install -g eas-cli
npm install

# 3. Login Expo
eas login

# 4. Configura il progetto (una volta sola)
eas build:configure

# 5. Genera il file per Play Store
eas build --platform android --profile production
```

### 1.3 Attendi ~15 minuti
EAS compilerà il file e ti darà un link. Scarica il file `.aab`.

---

## PASSO 2 — Pubblica la Privacy Policy (serve un URL)

### Opzione più veloce: GitHub Pages (gratis)
1. Vai su https://github.com/new → crea repo pubblico chiamato `ricettario-privacy`
2. Crea file `index.html` → incolla il contenuto qui sotto
3. Vai su **Settings → Pages** → Source: `main` branch `/root`
4. URL finale: `https://<tuo-username>.github.io/ricettario-privacy/`

### Contenuto `index.html` (copia-incolla)

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Privacy Policy - Il Ricettario</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #222; }
h1, h2 { color: #FF6B35; }
</style>
</head>
<body>
<h1>Privacy Policy - Il Ricettario</h1>
<p><strong>Ultimo aggiornamento: Aprile 2026</strong></p>

<p>Il Ricettario ("noi") gestisce l'app mobile "Il Ricettario" (il "Servizio").</p>

<h2>Dati che raccogliamo</h2>

<h3>Identificatore di dispositivo</h3>
<p>Un ID casuale viene generato sul tuo telefono per isolare la tua collezione di ricette. Nessun advertising ID viene usato per tracciamento cross-app.</p>

<h3>Nome (opzionale)</h3>
<p>Il nome che scegli di visualizzare (default "Utente"). Puoi modificarlo o lasciarlo vuoto.</p>

<h3>Contenuti delle ricette</h3>
<p>URL Instagram/Facebook che incolli, caption, thumbnail video, trascrizioni generate da AI, ingredienti, nomi cartelle, tag, preferiti. Memorizzati:</p>
<ul>
<li>localmente sul tuo dispositivo</li>
<li>nel nostro database cloud (HTTPS), associati al tuo Device ID</li>
</ul>

<h3>Dati pubblicitari</h3>
<p>Usiamo Google AdMob per mostrare annunci rewarded interstitial. AdMob può raccogliere advertising identifier per annunci personalizzati. Puoi rifiutare al primo avvio o dalle impostazioni del dispositivo.</p>

<h2>Servizi AI</h2>
<p>Usiamo Google Gemini per estrarre ingredienti e istruzioni dai video. I frame video e le caption vengono inviati ai server Google per l'elaborazione. Non conserviamo questi dati dopo l'elaborazione.</p>

<h2>Terze parti</h2>
<ul>
<li>Google AdMob - pubblicità</li>
<li>Google Gemini - analisi AI ricette</li>
<li>Instagram, Facebook, Snapsave - estrazione video pubblici</li>
</ul>

<p>NON raccogliamo: posizione, contatti, messaggi, foto personali, dati di pagamento, email, numero di telefono.</p>

<h2>I tuoi diritti</h2>
<p>Puoi eliminare tutti i tuoi dati disinstallando l'app. Non c'è login. Puoi esportare i tuoi dati (Impostazioni → Esporta Backup) ed eliminare singole ricette dall'app.</p>

<h2>Privacy dei minori</h2>
<p>Il Servizio non è destinato a minori di 13 anni. Non raccogliamo consapevolmente dati da minori. Se credi che un minore ci abbia fornito dati, contattaci.</p>

<h2>Conservazione dei dati</h2>
<p>Le ricette rimangono nel database finché il tuo Device ID è attivo. Disinstallare l'app orfana i dati, che vengono eliminati automaticamente dopo 180 giorni di inattività.</p>

<h2>Sicurezza</h2>
<p>Tutti i dati in transito sono crittografati via HTTPS. Non memorizziamo password. I dati backend sono su MongoDB gestito con controlli di accesso.</p>

<h2>Modifiche a questa policy</h2>
<p>Potremmo aggiornare questa Privacy Policy. Ti notificheremo cambiamenti rilevanti nell'app.</p>

<h2>Contatti</h2>
<p>Per domande: <strong>la-tua-email@gmail.com</strong></p>
</body>
</html>
```

**⚠️ IMPORTANTE**: sostituisci `la-tua-email@gmail.com` con la tua email reale.

---

## PASSO 3 — Crea l'app su Play Console

1. Vai su https://play.google.com/console
2. Clicca **"Crea app"** in alto a destra
3. Compila:

| Campo | Valore |
|-------|--------|
| **Nome app** | `Il Ricettario` |
| **Lingua predefinita** | `Italiano - it-IT` |
| **App o gioco** | `App` |
| **Gratuita o a pagamento** | `Gratuita` |
| **Dichiarazioni** | ✅ Spunta tutte e due (norme developer program + leggi esportazione USA) |

Clicca **"Crea app"**.

---

## PASSO 4 — Scheda del Play Store (Info su app → Scheda principale)

### 4.1 Dettagli dell'app

| Campo | Valore |
|-------|--------|
| **Nome app** | `Il Ricettario` |
| **Breve descrizione** (80 char max) | `Salva e organizza ricette video da Instagram e Facebook con AI` |
| **Descrizione completa** (4000 char max) | *(incolla sotto ↓)* |

### 4.2 Descrizione completa (copia-incolla)

```
🍳 Il tuo ricettario digitale personale

Stanco di salvare ricette da Instagram e Facebook per poi non ritrovarle più? Il Ricettario ti aiuta a organizzare tutti i tuoi link di ricette video in un unico posto, con l'aiuto dell'Intelligenza Artificiale.

✨ FUNZIONALITÀ PRINCIPALI

🔗 Salvataggio rapido
Incolla il link di una ricetta da Instagram o Facebook e l'app organizza automaticamente il contenuto per te. Supporto per condivisione diretta dal menu "Condividi" di Instagram.

🤖 AI che legge i video
La nostra AI (Google Gemini) analizza i video delle ricette ed estrae automaticamente:
• Titolo della ricetta
• Lista degli ingredienti
• Istruzioni passo-passo

📁 Organizzazione a cartelle
Crea cartelle e sottocartelle personalizzate: "Primi piatti", "Dolci", "Antipasti", come preferisci. Sposta le ricette da una cartella all'altra con un tap.

🛒 Lista della spesa intelligente
Seleziona più ricette e genera automaticamente una lista della spesa aggregata, con quantità sommate per ogni ingrediente.

📄 Esporta in PDF
Esporta ogni ricetta come PDF elegante, da condividere su WhatsApp o stampare.

💾 Backup sicuro
Esporta l'intero ricettario in un file JSON per trasferirlo su un altro telefono o conservarlo al sicuro.

🌍 Multi-lingua
Disponibile in 10 lingue: italiano, inglese, spagnolo, francese, tedesco, portoghese, giapponese, cinese, arabo, hindi.

🎨 Tema chiaro e scuro
Scegli il tema che preferisci dalle impostazioni.

⭐ Preferiti, tag, difficoltà, tempi di preparazione
Personalizza ogni ricetta con tutti i dettagli che vuoi.

🔒 Privacy prima di tutto
Nessun account richiesto. I tuoi dati restano privati e isolati per dispositivo. Puoi cancellare tutto in qualsiasi momento.

📱 Ottimizzata per mobile
Interfaccia veloce e reattiva, pensata per l'uso in cucina.

Scarica Il Ricettario e trasforma il caos dei link salvati in un vero ricettario personale! 👨‍🍳👩‍🍳
```

### 4.3 Grafica

| Campo | Dimensione richiesta | Cosa fare |
|-------|---------------------|-----------|
| **Icona** | 512 x 512 PNG | Usa `frontend/assets/images/icon.png` (già presente) |
| **Grafica Feature** | 1024 x 500 PNG | Creala su [Canva](https://canva.com) (template "Google Play Feature Graphic") |
| **Screenshot telefono** (min 2, max 8) | Min 320px lato corto | Vedi sotto ↓ |

### 4.4 Come prendere screenshot (facile)

1. Apri Il Ricettario sul tuo telefono
2. Apri queste schermate e fai uno screenshot ciascuna:
   - **Home** (con 2-3 ricette)
   - **Dettaglio ricetta** (con ingredienti estratti)
   - **Cartelle**
   - **Lista della Spesa** (dopo generazione)
   - **Esporta PDF** (quando si apre il share sheet)
3. Invia i 5 screenshot al tuo PC (WhatsApp/Drive) → carica su Play Console

---

## PASSO 5 — Contenuti dell'app

### 5.1 Privacy Policy

Campo **"URL Privacy Policy"** → incolla:
```
https://<tuo-username>.github.io/ricettario-privacy/
```

### 5.2 Ads

Clicca **"Sì, la mia app contiene annunci"**

### 5.3 Accesso all'app

Seleziona **"Tutta la funzionalità è disponibile senza restrizioni"**
(Non c'è login, quindi nessuna credenziale da fornire al reviewer).

### 5.4 Annunci pubblicitari

Se chiedono info su test device, rispondi **no** (non richiesto).

### 5.5 Classificazione contenuti (IARC)

Clicca **"Avvia questionario"**. Rispondi così:

| Domanda | Risposta |
|---------|----------|
| Email contatto | la tua email |
| Categoria | **Utility / Productivity / Comunicazione** (o **Reference, news, or education**) |
| Violenza | NO a tutto |
| Sessualità | NO a tutto |
| Linguaggio volgare | NO |
| Sostanze controllate | NO |
| Gioco d'azzardo | NO |
| User-generated content | **NO** (anche se tecnicamente gli utenti incollano link, non è UGC pubblico) |
| Condivide la posizione | NO |
| Permette agli utenti di interagire | NO |
| Acquisti in-app | NO |
| Miscellanea | NO a tutte |

→ Classificazione attesa: **PEGI 3 / Everyone** ✅

### 5.6 Pubblico e contenuti

| Campo | Valore |
|-------|--------|
| **Fasce d'età target** | **13-17**, **18+** (NON spuntare 5-12) |
| **App progettata per bambini?** | **NO** |
| **Approfondimenti mirati ai bambini?** | **NO** |

### 5.7 Contenuti giornalistici

**NO**, non è un'app giornalistica.

### 5.8 Sicurezza dei dati (⭐ importante)

**Dati raccolti?** → **SÌ**

Poi per ogni tipo di dato:

| Dato | Raccolto? | Condiviso con terzi? | Scopo |
|------|-----------|---------------------|-------|
| **Nome** | SÌ (opzionale) | NO | Funzionalità app |
| **ID utente** | SÌ (Device ID generato localmente) | NO | Funzionalità app (isolamento dati) |
| **Interazioni con app** (contatori ads) | SÌ | NO | Analisi |
| **Acquisti in-app** | NO | — | — |
| **Posizione** | NO | — | — |
| **Info finanziarie** | NO | — | — |
| **Contatti** | NO | — | — |
| **Messaggi** | NO | — | — |
| **Foto/video** | NO | — | — |
| **File/documenti** | NO | — | — |

Altre domande:
- **Dati crittografati in transito?** → **SÌ** (HTTPS)
- **Gli utenti possono richiedere l'eliminazione?** → **SÌ** (disinstallando l'app)
- **Si applica Data Safety?** → **SÌ**

### 5.9 Governo

Non sei uno sviluppatore governativo → **NO**.

### 5.10 Destinatari e contenuti

Come sopra: **13+**, **non per bambini**.

---

## PASSO 6 — Carica il .aab (Release Production)

1. Vai su **"Produzione"** nel menu laterale sinistro
2. Clicca **"Crea nuova release"**
3. Primo upload: seleziona **"Firma di app - consenti a Google di gestirla"** (raccomandato)
4. Carica il file `.aab` scaricato al Passo 1
5. Campo **"Nome release"**: `v1.0.0`
6. Campo **"Note release"** (incolla):

```
Prima versione ufficiale di Il Ricettario!

• Salvataggio automatico ricette da Instagram e Facebook
• Estrazione AI di ingredienti e istruzioni
• Organizzazione in cartelle e sottocartelle
• Lista della spesa automatica con AI
• Esportazione PDF
• Backup e ripristino dati
• Tema chiaro/scuro
• Supporto 10 lingue
```

---

## PASSO 7 — Review della release

1. Clicca **"Controlla release"** → Google mostra eventuali errori
2. Se tutto verde, clicca **"Invia per la revisione"**

⏳ Attesa Google: **3-7 giorni** (prima pubblicazione può arrivare a 14 giorni).

---

## 🎯 Checklist finale PRIMA di inviare

Prima di cliccare "Invia per la revisione", verifica:

- [ ] Privacy Policy URL inserito e funzionante
- [ ] Almeno 2 screenshot caricati
- [ ] Icona 512x512 caricata
- [ ] Feature graphic 1024x500 caricato
- [ ] Descrizione completa + breve inserite
- [ ] Classificazione contenuti COMPLETATA (barra verde)
- [ ] Sicurezza dei dati COMPLETATA (barra verde)
- [ ] Pubblico e contenuti COMPLETATO (barra verde)
- [ ] File .aab caricato in "Produzione"
- [ ] Note release compilate

Se vedi tutte le barre verdi nel menu laterale → **pronto per inviare!** 🚀

---

## ❗ Se Google boccia la review

Cause più comuni (e fix):

| Motivo | Fix |
|--------|-----|
| "Descrizione fuorviante" | Rimuovi "scarica video Instagram" dalla descrizione |
| "Missing privacy policy" | Verifica che l'URL GitHub Pages risponda con 200 |
| "Violates IP (Instagram logo)" | Non usare loghi IG/FB nei screenshot, usa solo icone generiche |
| "Crashes on launch" | Testa l'APK sul tuo telefono prima di caricare |
| "Data Safety incomplete" | Ricompila sezione 5.8 |
| "Ad content policy" | Verifica che UMP consent appaia al primo avvio |

---

## 📧 Contatti di supporto se serve

- Supporto developer Google: https://support.google.com/googleplay/android-developer
- Chat diretta review: disponibile dopo la prima pubblicazione
- Appeal rejection: da Play Console → Policy → Appeal

---

## 🎉 Dopo la pubblicazione

Quando l'app è online:
1. URL pubblico: `https://play.google.com/store/apps/details?id=app.emergent.foodorganizer241c92aba2`
2. Condividilo con amici/social
3. Su AdMob → collega l'app al Play Store per attivare i guadagni reali

Buona fortuna! 🍀
