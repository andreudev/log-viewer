# 🔌 API Backend — Referencia

> Documentación de los endpoints HTTP y WebSocket implementados en [`server.js`](../server.js).

**Base URL:** `http://localhost:<PORT>` (default `3000`)
**Puerto configurable:** variable de entorno `PORT`.

---

## 📋 Tabla de Contenidos

1. [Archivos](#1-archivos)
2. [Conexiones SSH](#2-conexiones-ssh)
3. [Ajustes del Sistema](#3-ajustes-del-sistema)
4. [Integración con IA](#4-integración-con-ia)
5. [Replicación de Peticiones](#5-replicación-de-peticiones)
6. [Webhooks](#6-webhooks)
7. [Búsqueda Global](#7-búsqueda-global)
8. [WebSocket](#8-websocket)
9. [Códigos de Error y Formatos](#9-códigos-de-error-y-formatos)

---

## 1. Archivos

### `GET /api/files`

Lista todos los archivos `.log` y `.txt` del directorio local + todos los servidores SSH configurados.

**Respuesta 200:**

```json
[
  {
    "name": "app-2026-07-04.log",
    "sizeBytes": 1234567,
    "modifiedAt": "2026-07-04T17:15:32.000Z",
    "createdAt": "2026-07-04T00:00:00.000Z",
    "origin": "local",
    "originName": "Local"
  },
  {
    "name": "capa-media.log",
    "sizeBytes": 5432100,
    "modifiedAt": "2026-07-06T10:00:00.000Z",
    "createdAt": "2026-06-30T00:00:00.000Z",
    "origin": "1718900000000",
    "originName": "prod-api-01"
  }
]
```

**Orden:** descendente por `modifiedAt`.

**Errores:**

| Código | Causa |
|---|---|
| 500 | `LOGS_DIR` inaccesible o permisos. |

---

### `GET /api/files/:filename?origin=<id>`

Lee el contenido completo de un archivo. Streaming directo al socket.

**Path params:**

| Param | Tipo | Descripción |
|---|---|---|
| `filename` | string (sin `/` ni `\`) | Nombre del archivo. Validado contra path traversal. |

**Query params:**

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `origin` | string | `local` | `local` o el `id` de una conexión SSH. |

**Respuesta 200:** `Content-Type: text/plain; charset=utf-8`, body = contenido del archivo.

**Errores:**

| Código | Mensaje | Causa |
|---|---|---|
| 400 | `Invalid filename` | Contiene `/`, `\\` o `..`. |
| 400 | `Only .log and .txt files can be read` | Extensión no permitida. |
| 404 | `File not found` | Archivo no existe. |
| 404 | `Remote file not found: <path>` | Error SFTP code 2. |
| 404 | `Permission denied on <host>:<path>. Configure a sudo password for this server, or run 'sudo chmod 777 <path>' manually.` | Sin sudo password. |
| 500 | `Connection failed: <msg>` | Error SSH general. |

> 🔁 Si el backend detecta `Permission denied` (SFTP code 3) y **existe** `sudoPassword` para esa conexión, ejecuta `sudo chmod 777` automáticamente **una vez** y reintenta. Si el reintento falla, devuelve el 404 con `permDenied: true, hasSudo: false`.

---

## 2. Conexiones SSH

### `GET /api/ssh-connections`

Lista conexiones. Los secretos se omiten.

**Respuesta 200:**

```json
[
  {
    "id": "1718900000000",
    "name": "prod-api-01",
    "host": "10.20.30.40",
    "port": 22,
    "username": "qa-deploy",
    "authType": "password",
    "logDir": "/var/log/capa-media/",
    "hasPassword": true,
    "hasPrivateKey": false,
    "hasSudoPassword": true,
    "privateKeyPath": ""
  }
]
```

---

### `POST /api/ssh-connections`

Crea o actualiza una conexión.

**Body:**

```json
{
  "id": "1718900000000",        // opcional en creación
  "name": "prod-api-01",
  "host": "10.20.30.40",
  "port": 22,
  "username": "qa-deploy",
  "authType": "password",       // "password" | "privateKey"
  "password": "******",
  "privateKeyContent": "-----BEGIN...",
  "privateKeyPath": "",
  "logDir": "/var/log/capa-media/",
  "sudoPassword": "******"
}
```

**Comportamiento de secretos:**

| Campo enviado | Si era `undefined` | Si era string | Si era vacío |
|---|---|---|---|
| `password` | se conserva el cifrado previo | se cifra y reemplaza | se borra |
| `privateKeyContent` | se conserva | se cifra | se borra |
| `sudoPassword` | se conserva | se cifra | se borra |

**Errores:**

| Código | Causa |
|---|---|
| 400 | Falta `name`, `host` o `username`. |

---

### `DELETE /api/ssh-connections/:id`

Elimina una conexión.

**Respuesta 200:** `{ success: true }`.

---

### `POST /api/ssh-connections/test`

Prueba una configuración **sin guardar**.

**Body:** misma estructura que `POST /api/ssh-connections`.

**Comportamiento:** si se omite `password` y existe un `id`, se usan los secretos guardados.

**Respuesta 200:** `{ success: true, message: "SSH Connection successful!" }`.

**Errores:** 400 si falta `host` o `username`; 500 con `{ error: "Connection failed: <msg>" }` si falla.

**Timeout:** 7 segundos (`readyTimeout`).

---

### `POST /api/ssh-fix-perm`

Ejecuta `chmod 777 <archivo>` en un servidor remoto, con fallback a `sudo` si hay `sudoPassword` guardada.

**Body:**

```json
{
  "filename": "capa-media.log",
  "origin": "1718900000000"
}
```

**Respuesta 200:**

```json
{
  "ok": true,
  "mode": "sudo",          // "plain" | "sudo"
  "remoteFilePath": "/var/log/capa-media/capa-media.log",
  "host": "prod-api-01"
}
```

En caso de error:

```json
{
  "ok": false,
  "mode": "sudo",
  "stderr": "Sorry, user qa-deploy is not in the sudoers file.",
  "remoteFilePath": "...",
  "host": "prod-api-01"
}
```

---

## 3. Ajustes del Sistema

### `GET /api/settings`

**Respuesta 200:**

```json
{
  "localLogsDir": "C:\\logs",
  "aiEnabled": false,
  "aiProvider": "gemini",
  "aiEndpoint": "",
  "aiModel": "gemini-1.5-flash",
  "hasAiApiKey": false
}
```

> El endpoint **nunca** devuelve el contenido de `aiApiKey`, solo el booleano `hasAiApiKey`.

---

### `POST /api/settings`

Actualiza ajustes.

**Body (parcial):**

```json
{
  "localLogsDir": "D:\\logs",
  "aiEnabled": true,
  "aiProvider": "nvidia",
  "aiApiKey": "******",          // '******' = conserva la cifrada
  "aiEndpoint": "https://integrate.api.nvidia.com/v1",
  "aiModel": "meta/llama-3.3-70b-instruct"
}
```

**Validaciones:**

- `localLogsDir` debe existir y ser directorio (sino 400).
- Tras guardar, el servidor cierra todos los WebSocket `/ws/files` para forzar reconexión con la nueva carpeta.

**Manejo de `aiApiKey`:**

| Valor enviado | Comportamiento |
|---|---|
| `undefined` (omitido) | Conserva la cifrada actual. |
| `'******'` | Conserva la cifrada actual (placeholder de la UI). |
| `''` (vacío) | Borra la clave. |
| otro string | Reemplaza y cifra con la nueva. |

---

## 4. Integración con IA

### `POST /api/settings/ai/test`

Prueba la conexión con el provider configurado.

**Body:** cualquier subset de `system_settings` (mismas reglas de `aiApiKey`).

**Respuesta 200:** `{ success: true, response: "OK" }` (cuando el provider responde "OK" al prompt de prueba).

**Errores:**

| Código | Causa |
|---|---|
| 400 | No hay API key ni guardada ni en el body. |
| 500 | Error devuelto por el provider. |

---

### `POST /api/ai-diagnose`

Genera un diagnóstico IA para un log. **Streaming** (`Content-Type: text/plain`, `Transfer-Encoding: chunked`).

**Body:**

```json
{
  "id": "L-12345",
  "timestamp": "2026-07-06T10:00:00",
  "level": "ERROR",
  "service": "PagosService",
  "className": "com.empresa.PagosService",
  "thread": "http-nio-8080-exec-3",
  "message": "java.lang.NullPointerException at line 42...",
  "annotation": "Esto pasó tras el deploy 2026-07-05"
}
```

> ⚠️ `aiEnabled` debe estar en `true` en ajustes. Mensajes >5000 chars se truncan.

**Respuesta 200:** stream con markdown. Estructura esperada:

````markdown
# Análisis
1. **Análisis de la Falla**
2. **Causas Probables**
3. **Impacto Estimado**
4. **Soluciones Recomendadas**
````

**Errores:** 400 si IA desactivada; 500 si el provider falla (los chunks enviados se pierden).

---

## 5. Replicación de Peticiones

### `POST /api/replay`

Proxy HTTP para evitar CORS.

**Body:**

```json
{
  "url": "https://api.ejemplo.com/pagos",
  "method": "POST",
  "headers": { "Authorization": "Bearer ..." },
  "body": "{\"monto\":1500}"
}
```

**Respuesta 200:**

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": "{...}",
  "timeMs": 234
}
```

**Errores:** 400 si falta `url`. 500 si la petición externa falla.

> El helper `makeHttpRequest` en `server.js` soporta `http` y `https`.

---

## 6. Webhooks

### `POST /api/webhook`

Reenvía un payload al `webhookUrl` configurado.

**Body:**

```json
{
  "webhookUrl": "https://hooks.slack.com/services/...",
  "payload": { "text": "..." }
}
```

**Respuesta 200:**

```json
{
  "success": true,
  "status": 200,
  "message": "ok"
}
```

> El frontend nunca hace la petición directamente para evitar CORS.

---

## 7. Búsqueda Global

### `POST /api/search-global`

Busca una cadena o regex en **todos los archivos** (locales + SSH).

**Body:**

```json
{
  "query": "ERROR.*timeout",
  "isRegex": true
}
```

**Respuesta 200:**

```json
{
  "success": true,
  "results": [
    {
      "fileKey": "local::app-2026-07-04.log",
      "fileName": "app-2026-07-04.log",
      "originName": "Local",
      "count": 12,
      "snippets": [
        { "lineNum": 1543, "text": "ERROR Timeout calling upstream..." }
      ]
    },
    {
      "fileKey": "1718900000000::capa-media.log",
      "fileName": "capa-media.log",
      "originName": "prod-api-01",
      "count": 5,
      "snippets": []
    }
  ]
}
```

> El límite de `snippets` por archivo es **5** para mantener la respuesta ágil.

---

## 8. WebSocket

El servidor hace **upgrade** automático para dos paths:

### `WS /ws/files`

Empuja la lista de archivos cada vez que cambia el directorio (con debounce de 300ms).

**Mensajes:**

```json
{ "type": "files", "data": [ /* mismo formato que GET /api/files */ ] }
```

**Cliente típico:** [`filesSocket.ts`](../src/infrastructure/api/filesSocket.ts).

> Al cambiar `localLogsDir` por API, el servidor cierra este WS en todos los clientes para forzar reconexión.

---

### `WS /ws/tail?filename=<name>&origin=<id>`

Tail en vivo de un archivo. Maneja `logrotate` (truncamiento).

**Validaciones:**

- `filename` no puede contener `/`, `\\` ni `..`.
- Si `origin=local`, el archivo debe existir en `LOGS_DIR`.

**Mensajes:**

```json
{ "type": "line", "data": "2026-07-06T10:00:01 INFO [Thread-1] Mensaje..." }
```

**Comportamiento:**

- Posición inicial = tamaño actual del archivo (no envía histórico).
- `fs.watch` (local) o polling remoto detecta nuevos bytes.
- Si `currentSize < position` → truncamiento detectado → reinicia posición a 0.
- Códigos de cierre: `1008` (filename inválido), `1009` (no existe), `1011` (error accediendo).

---

## 9. Códigos de Error y Formatos

### Códigos HTTP usados

| Código | Significado en LogScope |
|---|---|
| 200 | OK / stream |
| 400 | Input inválido / path traversal / extensión no permitida |
| 404 | Archivo no encontrado / SSH connection no encontrada |
| 500 | Excepción genérica (revisar `.runtime-logs/server.err.log`) |

### Códigos SFTP relevantes

| Código | Significado |
|---|---|
| 2 | `SSH_FX_NO_SUCH_FILE` |
| 3 | `SSH_FX_PERMISSION_DENIED` (activa el flujo `chmod 777`) |

### Formato de errores JSON

```json
{ "error": "Mensaje legible por humanos" }
```

En `ssh-fix-perm`:

```json
{ "ok": false, "mode": "sudo", "stderr": "...", "host": "...", "remoteFilePath": "..." }
```

### Tiem límite

| Endpoint | Timeout |
|---|---|
| `POST /api/ssh-connections/test` | 7s (`readyTimeout`) |
| `POST /api/ssh-fix-perm` | 10s (`readyTimeout`) |
| `POST /api/search-global` | sin timeout duro (depende del servidor) |
| `POST /api/ai-diagnose` | sin timeout duro (depende del provider) |
| `WS /ws/tail` | sin timeout (continúa mientras el archivo exista) |

---

## Respuestas de Configuración

La UI recibe `hasAiApiKey: boolean` y `hasPassword: boolean` para nunca exponer los secretos. Los secretos se descifran **dentro de `server.js`** solo en el momento de uso (conexión SSH, llamada al provider de IA) y jamás se serializan al cliente.
