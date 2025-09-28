# Steam Profile Comment Bot

Herramienta automática para publicar comentarios en perfiles de Steam con retrasos aleatorios y soporte de CSV. Usa `steam-user` para autenticación y `steamcommunity` para publicar comentarios.

---

## Empezar rápido en tu cuenta 

Quieres publicar desde tu cuenta con vanity URL: `https://steamcommunity.com/id/xxxxxx/`.

Este bot actualmente no acepta vanity URLs (`/id/usuario`) como destino. Necesitas convertir cada destino a su SteamID64 o usar URL del tipo `/profiles/<steamid64>`.

Pasos para obtener tu SteamID64 (o el de cualquier perfil):
1. Abre https://steamid.io/lookup/tsumiki555
2. Copia el valor de SteamID64 (17 dígitos), por ejemplo: `7656119XXXXXXXXXX`.
3. Puedes usar ese ID en `targets.csv` o con `--profile`.

Ejemplos:
- Un solo perfil: `npm start -- --profile 7656119XXXXXXXXXX --message "Hola!"`
- CSV: en `targets.csv`, usa líneas como `7656119XXXXXXXXXX,Hola!` o `https://steamcommunity.com/profiles/7656119XXXXXXXXXX,Hola!`

> Nota: El bot publica comentarios EN los perfiles objetivo. La cuenta que inicia sesión (la tuya) es la que comenta.

---

## Aviso y responsabilidad
- Este proyecto es educativo. El uso puede violar los ToS de Steam si se abusa. Úsalo bajo tu responsabilidad.
- Se recomiendan límites estrictos y pausas largas para minimizar riesgos (ver sección de límites).

## Requisitos
- Node.js 18+
- Cuenta de Steam con Steam Guard (email o app). Opcional: `STEAM_SHARED_SECRET` para 2FA automático por TOTP.

## Instalación
```bash
npm install
# Copia la configuración de ejemplo
cp .env.example .env   # en PowerShell: Copy-Item .env.example .env
```

Edita `.env` y rellena:
- `STEAM_USERNAME`, `STEAM_PASSWORD` (tu cuenta que publicará los comentarios)
- `STEAM_SHARED_SECRET` (opcional; si no, el bot te pedirá el código 2FA por consola)
- `DEFAULT_MESSAGE` (mensaje por defecto si el CSV no trae uno)
- `MIN_DELAY_MS`, `MAX_DELAY_MS` (retraso aleatorio entre comentarios; p. ej. 30000–90000)
- `CSV_PATH` (ruta del CSV por defecto, p. ej. `targets.csv`)

## Formato de CSV (`targets.csv`)
Archivo con cabeceras `profile,message`:
```
profile,message
https://steamcommunity.com/profiles/76561198000000000,Hola!
76561198000000001,Mensaje personalizado
```
Notas:
- Se admite SteamID64 directo o URL de perfil con `/profiles/`.
- Vanity URLs (con `/id/`) NO se resuelven por el bot. Conviértelas antes con https://steamid.io/.
- Si `message` está vacío, se usa `DEFAULT_MESSAGE` o `--message`.

## Uso (CLI)
Ejemplo típico con CSV y retrasos seguros:
```bash
npm start -- \
  --user "%STEAM_USERNAME%" \
  --pass "%STEAM_PASSWORD%" \
  --sharedSecret "%STEAM_SHARED_SECRET%" \
  --file targets.csv \
  --message "Hola desde el bot" \
  --minDelay 30000 \
  --maxDelay 90000
```

Enviar N mensajes iguales a un único perfil con intervalo fijo (sin CSV):
```bash
npm start -- \
  --user "%STEAM_USERNAME%" \
  --pass "%STEAM_PASSWORD%" \
  --profile 76561198451952537 \
  --message "Hola!" \
  --count 5 \
  --intervalSec 45
```

Parámetros CLI:
- `--user` Usuario de Steam (si falta, se toma de `.env`)
- `--pass` Password de Steam (si falta, se toma de `.env`)
- `--sharedSecret` Shared secret para TOTP 2FA (opcional)
- `--file` Ruta a CSV (si falta, se usa `.env:CSV_PATH`)
- `--profile` Un único destino (SteamID64 o URL `/profiles/<id>`)
- `--message` Mensaje por defecto
- `--count` Número de mensajes repetidos al usar `--profile`
- `--intervalSec` Intervalo fijo en segundos entre cada comentario (si se especifica, ignora `--minDelay`/`--maxDelay`)
- `--minDelay`, `--maxDelay` Retrasos aleatorios entre comentarios

## Buenas prácticas y límites sugeridos
- 20–40 comentarios/día con pausas de 30–120s.
- Inserta una pausa larga (5–10 min) cada 10–15 comentarios.
- Alterna mensajes si es posible para evitar patrones.

## Estructura del proyecto
- `src/index.js`: CLI, lectura de CSV/args, bucle principal con delays.
- `src/steamClient.js`: login con `steam-user` y obtención de cookies para `steamcommunity`.
- `src/commenter.js`: publica comentarios en un SteamID64 mediante `postUserComment`.
- `src/csv.js`: parseo de archivo CSV.
- `src/utils/delay.js`: espera fija y aleatoria.
- `src/utils/logger.js`: logs.

## Licencia
MIT
