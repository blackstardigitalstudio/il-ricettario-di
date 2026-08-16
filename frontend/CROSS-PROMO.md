# Cross-promo "Le altre app di Blackstar" — Il Ricettario di Casa

Sezione che promuove le altre app di Matteo (regola Blackstar) dentro l'app,
integrata con **expo-router**.

## File

- **Creato:** `components/AltreApp.tsx` — componente autonomo (fetch interno).
- **Modificato:** `app/(drawer)/settings.tsx` — import + render `<AltreApp />`
  in fondo allo `ScrollView`, subito dopo la sezione "About".

## Dove appare

Nella schermata **Impostazioni** (drawer → ⚙️ Impostazioni), come ultima
sezione della pagina, dopo "About / Made in Italy".

## Come funziona

1. **Fetch** da `https://rawcdn.githack.com/blackstardigitalstudio/blackstardigitalstudio.github.io/main/apps.json`
   (formato `{ "apps": [ { name, package, hook, icon, playUrl, kidsSafe } ] }`).
2. **Esclude questa app** filtrando `package === "studio.blackstardigital.ilricettario"`
   (e le voci senza `name`/`playUrl`).
3. Ogni voce: **icona** (`Image` con `{uri: icon}`, placeholder se assente),
   **nome**, **hook**; al tocco apre `playUrl` con `Linking.openURL`
   (stesso `Linking` di `react-native` già usato nel progetto).
4. **Offline-safe:** se il fetch fallisce, non è `ok`, o la lista risultante è
   vuota → il componente ritorna `null`, nessun errore a schermo.
5. **Stile coerente:** riusa il tema `useTheme()` (card, bordi, accent, testo),
   tocchi ≥44px (`minHeight: 44`, righe con padding). In fondo: **Made in Italy 🇮🇹**.

## Vincoli rispettati

- **Nessuna nuova dipendenza npm** (solo `fetch`, `Image`, `Linking`, `useTheme`).
- **Nessun permesso** aggiunto (niente foto/fotocamera/altro).
- Compatibile con **expo-router** (semplice componente importato nella route).

## Validazione

- `npx tsc --noEmit` → **exit 0**, nessun errore di tipo/import/sintassi.

---
Made in Italy 🇮🇹
