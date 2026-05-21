# Backend Setup Instructions

## 1. Environment Variables Setup

**Paso 1:** Copia `firebase-admin.json` (tu archivo de credenciales desde Firebase) a este directorio.

**Paso 2:** Crea un archivo `.env` en `backend/` con:

```bash
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini

# Firebase - Option A: Service Account JSON (RECOMENDADO)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
FIREBASE_STORAGE_BUCKET=nemup-storage.appspot.com

# Server
PORT=3000
NODE_ENV=development
```

**Importante:** `FIREBASE_SERVICE_ACCOUNT_JSON` debe ser una STRING en una sola línea (compactada). 

**Fácil:** Si tienes `firebase-admin.json`, puedes hacer esto en PowerShell:

```powershell
$json = Get-Content firebase-admin.json -Raw
$env:FIREBASE_SERVICE_ACCOUNT_JSON = $json
[Environment]::SetEnvironmentVariable("FIREBASE_SERVICE_ACCOUNT_JSON", $json, "User")
```

Luego crear `.env`:

```bash
OPENAI_API_KEY=tu_clave_aqui
OPENAI_MODEL=gpt-4.1-mini
FIREBASE_SERVICE_ACCOUNT_JSON=<paste-json-string>
FIREBASE_STORAGE_BUCKET=nemup-storage.appspot.com
PORT=3000
NODE_ENV=development
```

## 2. Development

```bash
npm run dev        # Run with watch (tsx watch)
npm run build      # Build TypeScript
npm start          # Run compiled JS
```

## 3. Firestore Collection Schema

Ver `src/services/firebaseAdmin.ts` para el esquema de colecciones.

Básicamente:
- `/users/{userId}` — Perfil del usuario
- `/users/{userId}/sessions/{sessionId}` — Sesiones generadas
- `/documents/{documentId}` — Metadata de documentos subidos

## 4. OpenAI Model

Usando: `gpt-4.1-mini` (recomendado para buen balance de velocidad, calidad y costo).

Docs: https://platform.openai.com/docs/api-reference
