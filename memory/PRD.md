# Il Ricettario - App Gestionale Ricette

## Overview
App mobile per salvare e organizzare ricette video da Instagram e Facebook con trascrizione AI, note personali e gestione cartelle/sottocartelle.

## Core Features
- **Nome personalizzato**: "Il Ricettario di [Nome]" - setup al primo accesso
- **Estrazione video/caption**: Incolla link Instagram/Facebook, estrai video e descrizione
- **Inserimento manuale**: Se l'estrazione fallisce, inserisci manualmente la caption
- **Cartelle e sottocartelle**: Organizza le ricette in categorie e sottocategorie
- **Modifica ricette**: Modifica nome, descrizione e note in qualsiasi momento
- **Note personali**: Aggiungi annotazioni a ogni ricetta
- **Trascrizione AI**: Trascrivi l'audio del video con OpenAI Whisper
- **Ricerca**: Cerca tra nome, descrizione, note e trascrizione
- **Compressione video**: Ogni 3 video salvati, comprimi automaticamente i vecchi

## Tech Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router
- **Backend**: FastAPI + MongoDB
- **AI**: OpenAI Whisper (whisper-1) via Emergent LLM Key
- **Video**: yt-dlp per estrazione, FFmpeg per compressione

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/ | Health check |
| POST | /api/profile | Crea/aggiorna profilo utente |
| GET | /api/profile | Ottieni profilo |
| POST | /api/folders | Crea cartella |
| GET | /api/folders | Lista cartelle |
| PUT | /api/folders/{id} | Aggiorna cartella |
| DELETE | /api/folders/{id} | Elimina cartella |
| POST | /api/subfolders | Crea sottocartella |
| GET | /api/subfolders | Lista sottocartelle |
| PUT | /api/subfolders/{id} | Aggiorna sottocartella |
| DELETE | /api/subfolders/{id} | Elimina sottocartella |
| POST | /api/extract | Estrai video da URL |
| POST | /api/recipes | Crea ricetta |
| GET | /api/recipes | Lista ricette (con filtro e ricerca) |
| GET | /api/recipes/count | Conta ricette |
| GET | /api/recipes/{id} | Dettaglio ricetta |
| PUT | /api/recipes/{id} | Aggiorna ricetta |
| DELETE | /api/recipes/{id} | Elimina ricetta |
| POST | /api/recipes/{id}/transcribe | Avvia trascrizione AI |

## Navigation
- **Home**: Lista ricette con barra di ricerca
- **Aggiungi**: Form per aggiungere nuova ricetta da link
- **Cartelle**: Gestione cartelle e sottocartelle
- **Dettaglio Ricetta**: Visualizza, modifica, trascrivi, note

## No Authentication Required
L'app non richiede login. Il profilo utente è salvato localmente.
