# 📋 Il Ricettario – Play Store Compliance Checklist

Ultimo aggiornamento: Aprile 2026.

## ✅ Modifiche già applicate nel codice

| # | Problema | Fix |
|---|----------|-----|
| 1 | Nome app "Il Ricettario di" (tronco) | ✅ Rinominato "Il Ricettario" |
| 2 | `WRITE/READ_EXTERNAL_STORAGE` obsolete (API 33+) | ✅ Rimosse + aggiunte a `blockedPermissions` |
| 3 | `versionCode` mancante | ✅ Aggiunto `versionCode: 2` per il prossimo upload |
| 4 | AdMob App ID manifest | ✅ Registrato via plugin `react-native-google-mobile-ads` |
| 5 | UMP Consent EU (GDPR) | ✅ Richiesto al primo avvio tramite AdsConsent.showForm() |
| 6 | Test ad IDs in dev | ✅ `__DEV__` usa IDs test Google, prod usa i tuoi |

## 📝 Azioni da fare TU sulla Play Console

### 1. **Data Safety Declaration** (obbligatorio)
Sezione: Play Console → App → Data safety

Devi dichiarare:
- ✅ **Personal info - Name**: collected, stored on device + backend (ottimizzazione UI personalizzata), non condiviso con terzi, opzionale
- ✅ **Device or other IDs**: collected (`X-Device-Id` generato localmente), per isolare le tue ricette, non condiviso
- ✅ **App activity - App interactions**: collected (counters annunci), per funzionalità, non condiviso
- ✅ **Photos and videos**: NOT collected
- ❌ Financial info, Location, Contacts, Messages, Files and docs: NON raccolti

Risposta tipo per ogni data type: *"Data is encrypted in transit (HTTPS). Users can request data deletion by uninstalling the app (device-based identity)."*

### 2. **Privacy Policy URL** (obbligatorio)
Serve un URL pubblico. Opzioni:

**Opzione A (più semplice)**: usa un servizio gratuito come [termly.io](https://termly.io) o [privacypolicygenerator.info](https://privacypolicygenerator.info)

**Opzione B**: pubblica tu stesso il testo seguente su GitHub Pages / Netlify / Google Sites. Testo pronto qui sotto ↓

### 3. **Content Rating** (IARC questionnaire)
- Target audience: **Everyone** (13+)
- No violence, no sexual content, no profanity, no gambling, no drugs
- Ads: **Yes, contains ads** (rewarded interstitial)
- User-generated content: NO

### 4. **App Category**
- Category: **Food & Drink**
- Tags: cooking, recipe, video

### 5. **Ads Declaration**
- Contains ads: **YES**
- Ad networks: **Google AdMob**

### 6. **Target audience**
- Età target: **13+** (NON child-directed) → obbligatorio per AdMob personalizzati

### 7. **Permissions giustification** (solo se richiesto)
| Permission | Giustificazione |
|------------|-----------------|
| INTERNET | Required to extract recipes from Instagram/Facebook and call AI services |
| ACCESS_NETWORK_STATE | Required to detect network availability before API calls |

---

## 📄 Privacy Policy — testo pronto (pubblica online come HTML)

```markdown
# Privacy Policy — Il Ricettario

Last updated: April 2026

Il Ricettario ("us", "we", or "our") operates the "Il Ricettario" mobile 
application (the "Service").

## Information We Collect

We collect the following information to provide and maintain the Service:

### On-device identifiers
A random device ID is generated on your phone to isolate your recipe 
collection from other users. No advertising ID or cross-app tracking is used.

### Profile data (optional)
Your chosen display name ("Utente" by default). You can edit or leave it empty.

### Recipe content
URLs you paste (Instagram/Facebook recipe reels), captions, video 
thumbnails, AI-generated transcriptions and ingredient lists, folder 
names, tags, favorites. This data is stored:
- locally on your device;
- on our secure cloud database (encrypted in transit, HTTPS only), 
  keyed to your device ID only.

### Advertising data
We show rewarded interstitial ads using Google AdMob. AdMob may collect 
advertising identifiers for personalized ads. You can opt out via the 
consent form shown on first launch, or from your device settings.

## AI Services
We use Google Gemini to extract ingredients and instructions from 
recipe videos. Video frames and captions are sent to Google servers 
for processing. We do not retain this data after processing.

## Third Party Services
- Google AdMob — advertising
- Google Gemini — AI recipe analysis  
- Instagram, Facebook, Snapsave — public recipe scraping

We do NOT collect: your location, contacts, messages, photos, payment 
information, email, phone number.

## Your Rights
You may delete all your data at any time by uninstalling the app. 
There is no login, therefore no cross-device account exists. You can 
also export your data (Settings → Export Backup) and delete individual 
recipes from within the app.

## Children's Privacy
Our Service is not directed to children under 13. We do not knowingly 
collect data from children under 13. If you believe a child has 
provided us with data, please contact us.

## Data Retention
Recipes and folders remain in our database as long as your device ID 
is active. Uninstalling the app orphans the data; it is automatically 
purged after 180 days of inactivity.

## Security
All data in transit is encrypted via HTTPS. We do not store passwords 
(there is no login). Backend data is stored in a managed MongoDB 
instance with access controls.

## Changes to this Policy
We may update this Privacy Policy from time to time. We will notify 
you of changes within the app.

## Contact
For any questions: <la tua email qui>
```

---

## ⚠️ Altri rischi da considerare

### Instagram/Facebook TOS (rischio alto)
Scraping di contenuti IG/FB viola i loro TOS. **Google Play NON lo sanziona** (non è compito loro), ma **Meta può mandare DMCA takedown** se ricevi molti report. Mitigazioni:
- Non dichiarare "scaricamento video" come feature principale nella descrizione Play Store
- Usa termini come "organizza i tuoi link", "gestisci le tue ricette"
- Non copiare i thumbnail IG come tuoi asset marketing

### Instant posting di ads (AdMob)
- **NON ricaricare manualmente** ads nello sviluppo. AdMob banna account per "invalid traffic" (click gonfiati da te).
- Prima di pubblicare, aggiungi il tuo device ID ai **Test Devices** su AdMob.

### Copyright (medio)
Gli utenti salvano link altrui. La tua app non re-distribuisce contenuti: l'utente scarica solo per uso personale. La DMCA safe harbor protegge gli intermediari ma sei tu a decidere cosa mostrare. Mitigazione: non condividi automaticamente ricette di altri utenti.

---

## 🚀 Ultimo check prima dell'upload APK/AAB

```bash
# In locale:
cd frontend
eas build --platform android --profile production

# EAS creerà:
# - app-release.aab (formato richiesto da Play Store, NON APK)
# - firmato con il tuo keystore (EAS lo gestisce)
```

Poi su Play Console:
1. Crea release "Production"
2. Carica il file .aab
3. Compila tutti i questionari sopra
4. Submit for review — attesa tipica: 3-7 giorni per prima pubblicazione

Buona fortuna! 🍀
