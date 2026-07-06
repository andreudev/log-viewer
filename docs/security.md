# 🔒 Seguridad y Manejo de Secretos

> LogScope maneja credenciales SSH, contraseñas y claves privadas que son **datos sensibles**. Este documento explica cómo se protegen, qué se cifra y dónde se guarda todo.

---

## 📋 Tabla de Contenidos

1. [Resumen de activos sensibles](#1-resumen-de-activos-sensibles)
2. [Esquema de cifrado AES-256-CBC](#2-esquema-de-cifrado-aes-256-cbc)
3. [`master.key` — la clave maestra](#3-masterkey--la-clave-maestra)
4. [`ssh_connections.json` — conexiones cifradas](#4-ssh_connectionsjson--conexiones-cifradas)
5. [`system_settings.json` — ajustes y API keys](#5-system_settingsjson--ajustes-y-api-keys)
6. [Buenas prácticas](#6-buenas-prácticas)
7. [Rotación y recuperación](#7-rotación-y-recuperación)
8. [Limitaciones conocidas](#8-limitaciones-conocidas)

---

## 1. Resumen de activos sensibles

| Archivo | Contenido | Cifrado | Versionado en Git |
|---|---|---|---|
| `master.key` | Clave AES-256 (32 bytes) | N/A (es la clave) | ❌ Ignorado |
| `ssh_connections.json` | Hosts, usuarios, passwords, claves privadas, sudo passwords | ✅ AES-256-CBC | ❌ Ignorado |
| `system_settings.json` | `localLogsDir`, `aiApiKey`, `aiEndpoint`, `aiModel` | Parcial (solo `aiApiKey` cifrado) | ❌ Ignorado |
| `localStorage` (navegador) | Pines, parsers, filtros, tema | ❌ Texto plano (contexto navegador) | N/A |
| `IndexedDB` (navegador) | Notas, sesiones guardadas, anotaciones | ❌ Texto plano (contexto navegador) | N/A |

> Los archivos sensibles están listados explícitamente en [`.gitignore`](../.gitignore) bajo el bloque `# Secrets / local config`.

---

## 2. Esquema de cifrado AES-256-CBC

Implementado en [`server.js`](../server.js) con el módulo nativo `node:crypto`.

### 2.1 Algoritmo

- **Cifrado:** `AES-256-CBC`
- **Tamaño de clave:** 32 bytes (256 bits)
- **IV:** 16 bytes aleatorios **por cada cifrado**
- **Encoding:** hexadecimal en disco

### 2.2 Formato en disco

```text
<iv_hex_32_chars>:<ciphertext_hex>
```

Ejemplo:

```text
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:8f7e6d5c4b3a2918...
```

### 2.3 Funciones de cifrado

````javascript
// filepath: server.js
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text) {
  if (!text) return '';
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const ivStr = parts[0];
  const encryptedTextStr = parts[1];
  if (ivStr.length !== 32) return text;
  try {
    const iv = Buffer.from(ivStr, 'hex');
    const encryptedText = Buffer.from(encryptedTextStr, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return text;
  }
}
````

### 2.4 Propiedades

- **Confidencialidad:** sí, siempre que `master.key` no se filtre.
- **Integridad:** ❌ **no** — un atacante con acceso al archivo podría alterar el ciphertext sin detection. Si necesitas integridad, evalúa migrar a AES-GCM o firmar con HMAC.
- **Replay:** ❌ no relevante en este modelo (no hay base de datos transaccional).

---

## 3. `master.key` — la clave maestra

### 3.1 Generación

- Se crea **al primer arranque** del backend:
  - Si no existe → `crypto.randomBytes(32)` → escribe a `master.key`.
  - Si existe → la lee del disco.

### 3.2 Ubicación

- Por defecto: `master.key` en la raíz del proyecto, junto a `server.js`.
- **Nunca** fuera del proyecto: la ruta se calcula con `path.join(__dirname, 'master.key')`.

### 3.3 Permisos

En Linux/macOS deberías hacer:

```bash
chmod 600 master.key
```

En Windows, NTFS hereda los permisos del usuario que arrancó `node server.js`.

### 3.4 Rotación

> 🔴 **Rotar `master.key` invalida TODAS las credenciales guardadas.** Las contraseñas SSH cifradas, claves privadas y API keys se vuelven indescifrables.

Procedimiento (cuando sea estrictamente necesario):

1. Detén el backend.
2. **Haz una copia de seguridad** del `master.key` viejo por si necesitas revertir.
3. Elimina `master.key`.
4. **Pide a tus usuarios que reintroduscan sus credenciales** (la UI mostrará campos vacíos porque el descifrado devolverá basura).
5. Arranca el backend de nuevo → se genera una nueva `master.key`.
6. Sube los nuevos `ssh_connections.json` y `system_settings.json` con credenciales en texto plano → el backend las cifrará con la nueva clave al guardar.

> 💡 Recomendación: **no rotes la clave salvo compromiso real**. Mejor, segmenta accesos (cada usuario usa su propio equipo).

---

## 4. `ssh_connections.json` — conexiones cifradas

### 4.1 Estructura en disco

````json
[
  {
    "id": "1718900000000",
    "name": "prod-api-01",
    "host": "10.20.30.40",
    "port": 22,
    "username": "qa-deploy",
    "authType": "password",
    "logDir": "/var/log/capa-media/",
    "privateKeyPath": "",
    "password": "a1b2...:8f7e...",
    "privateKeyContent": "",
    "sudoPassword": "c4d5...:3a2b..."
  }
]
````

Los campos con `:` son los **cifrados**.

### 4.2 Campos cifrados

| Campo | Cifrado | Notas |
|---|---|---|
| `password` | ✅ | Contraseña SSH |
| `privateKeyContent` | ✅ | Contenido de clave privada pegada en la UI |
| `sudoPassword` | ✅ | Solo se usa para `sudo -S chmod 777` |

`privateKeyPath` se guarda en **texto plano** porque es una ruta local; el secreto (la clave) está en ese otro archivo del sistema.

### 4.3 Endpoint expuesto al frontend

Solo metadatos sin secretos:

````javascript
app.get('/api/ssh-connections', (req, res) => {
  const connections = getSshConnections();
  const safeConnections = connections.map(conn => ({
    id, name, host, port, username, authType, logDir,
    hasPassword: !!conn.password,
    hasPrivateKey: !!conn.privateKeyContent || !!conn.privateKeyPath,
    hasSudoPassword: !!conn.sudoPassword,
    privateKeyPath: conn.privateKeyPath
  }));
  res.json(safeConnections);
});
````

La UI recibe `hasPassword: true` pero **nunca el valor**. Cuando el usuario edita la conexión y deja el campo vacío, se preserva el valor cifrado existente.

---

## 5. `system_settings.json` — ajustes y API keys

### 5.1 Estructura

````json
{
  "localLogsDir": "C:\\logs",
  "aiEnabled": true,
  "aiProvider": "gemini",
  "aiApiKey": "a1b2...:8f7e...",
  "aiEndpoint": "",
  "aiModel": "gemini-1.5-flash"
}
````

> ⚠️ **Solo `aiApiKey` está cifrado.** `aiEndpoint` y `aiModel` se guardan en texto plano porque son configuración, no secreto. `localLogsDir` se valida además que exista y sea directorio.

### 5.2 Endpoints AI soportados

Definidos en `server.js` → `callAiProvider()`:

| Provider | Cifrado de endpoint | Notas |
|---|---|---|
| `gemini` | N/A (endpoint es público de Google) | Necesita API key. |
| `nvidia` | N/A (endpoint público de NVIDIA NIM) | Opcional Bearer token. |
| `custom-json` / `openai-compatible` | ⚠️ Endpoint en claro | Si es interno, aceptable. |
| `ollama` | N/A (endpoint local típicamente) | No requiere clave. |

### 5.3 Enmascaramiento en la UI

Cuando se carga la API key guardada, la UI la renderiza como `******`. Para cambiarla, el usuario pega un valor nuevo; si lo deja en `******`, se conserva el cifrado previo.

---

## 6. Buenas prácticas

1. **No subas `master.key` ni los `*.json` sensibles a Git.** Ya están en `.gitignore`, pero verifica antes de cada commit:
   ```bash
   git status --ignored
   ```
2. **No compartas `master.key` por canales inseguros** (correo, Slack). Si necesitas sincronizar entre máquinas, transfiérelo por un canal cifrado y guárdalo con permisos `600`.
3. **No ejecutes LogScope como root/administrador** salvo necesidad técnica. Los procesos del servidor SSH deben correr con el usuario más privilegiado que necesites para leer los logs.
4. **Configura `sudo` con moderación.** Da `sudo -S chmod 777` solo si sabes que lo necesitas; una configuración más fina (grupo `adm`) sería mejor.
5. **Habilita SSH con claves + passphrase** y deshabilita login por contraseña en el servidor.
6. **Aísla LogScope en la red interna.** No expongas el puerto `3000` al exterior: el API incluye `/api/ssh-fix-perm` que puede escalar privilegios.
7. **Rotación periódica** de credenciales SSH si tu política lo requiere.

---

## 7. Rotación y recuperación

### 7.1 ¿Perdí `master.key`?

- Las contraseñas SSH quedan irrecuperables.
- El backend seguirá arrancando, pero descifrará como basura al abrir cada conexión.
- **Recuperación**: única vía es pedir al usuario que reintrodusca las credenciales.

### 7.2 ¿Quiero cambiar la `sudoPassword` sin tocar el resto?

1. Ve a Ajustes → Servidores SSH.
2. Edita la conexión.
3. Pega la nueva `sudoPassword`. El backend la cifra y guarda.
4. El resto de campos permanecen igual.

### 7.3 ¿Quiero revocar TODAS las conexiones?

1. Detén el backend.
2. Elimina `ssh_connections.json`.
3. Arranca de nuevo. La lista arranca vacía.

---

## 8. Limitaciones conocidas

| Limitación | Mitigación |
|---|---|
| AES-CBC sin MAC → vulnerable a tampering si el atacante edita el archivo | Permisos de filesystem (`chmod 600`). Evalúa migrar a AES-GCM. |
| `master.key` no tiene passphrase ni está protegida con HSM | Mantén el equipo físicamente seguro. |
| El navegador guarda localStorage sin cifrar (filtros, pines, parsers) | No almacena secretos del servidor; solo UX state. |
| Las contraseñas SSH viajan descifradas por la memoria del backend mientras la conexión está activa | Normal en SSH; mantener el proceso lo más confinado posible. |
| No hay auditoría de accesos al backend (`who descifró qué`) | Si la necesitas, añade logs a `server.js` (ver [Architecture](architecture.md)). |

> Para auditoría externa, considera ejecutar el backend detrás de un reverse proxy (nginx, Caddy) que loggee autenticación y rutas.
