# Expo Production-Ready Starter

Template con fix pre-applicati per evitare gli errori più comuni di `eas build`.

## Cosa c'è dentro

- `admob-plugin.js` — config plugin locale per AdMob (bypassa problemi di resolve su Windows)
- `.gitignore.template` — già esclude `package-lock.json` per forzare l'uso di yarn
- `eas.json.template` — profili `development` / `preview` / `production` pronti

## Quick start per un nuovo progetto

1. Crea il progetto Expo:
   ```bash
   npx create-expo-app my-app --template blank-typescript
   cd my-app
   ```

2. Copia i file template in `my-app/`:
   - `admob-plugin.js` (se l'app userà AdMob)
   - `.gitignore` (dal template)
   - `eas.json` (dal template)

3. In `package.json` aggiungi questo script di guardia:
   ```json
   "scripts": {
     "preinstall": "npx only-allow yarn"
   }
   ```

4. Installa solo con yarn:
   ```bash
   yarn install
   ```

5. Usa `npx expo install` per aggiungere pacchetti nativi (versione compatibile automatica):
   ```bash
   npx expo install expo-video react-native-google-mobile-ads
   ```

6. In `app.json`:
   ```json
   "plugins": [
     "expo-router",
     ["./admob-plugin", { "androidAppId": "ca-app-pub-...~..." }]
   ]
   ```

7. Prima del primo build, controlla tutto con:
   ```bash
   npx expo-doctor
   ```

8. Build:
   ```bash
   eas build --platform android --profile production
   ```

## Vedi anche

`/app/memory/EXPO_EAS_KNOWN_ISSUES.md` per la knowledge base completa.
