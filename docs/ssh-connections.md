# 🔐 Conexiones SSH — Guía Completa

> LogScope puede leer logs de **múltiples servidores remotos** vía SSH/SFTP, mezclarlos en una cronología unificada y aplicarles los mismos filtros que a los logs locales. Esta guía explica cómo configurarlo paso a paso.

---

## 📋 Tabla de Contenidos

1. [¿Qué puedes hacer con SSH en LogScope?](#1-qué-puedes-hacer-con-ssh-en-logscope)
2. [Requisitos en el servidor remoto](#2-requisitos-en-el-servidor-remoto)
3. [Abrir el panel de SSH](#3-abrir-el-panel-de-ssh)
4. [Configurar una nueva conexión](#4-configurar-una-nueva-conexión)
5. [Métodos de autenticación](#5-métodos-de-autenticación)
6. [Guardar credenciales y cifrado](#6-guardar-credenciales-y-cifrado)
7. [Explorar y seleccionar archivos remotos](#7-explorar-y-seleccionar-archivos-remotos)
8. [Tail (seguimiento en vivo)](#8-tail-seguimiento-en-vivo)
9. [Fix de permisos `chmod 777`](#9-fix-de-permisos-chmod-777)
10. [Búsqueda global cross-server](#10-búsqueda-global-cross-server)
11. [Solución de problemas](#11-solución-de-problemas)
12. [Seguridad](#12-seguridad)

---

## 1. ¿Qué puedes hacer con SSH en LogScope?

Una vez configurada una conexión SSH, LogScope te permite:

| Funcionalidad | Descripción |
|---|---|
| 📂 **Listar archivos remotos** | `GET /api/files` lista archivos `.log` y `.txt` en la carpeta configurada del servidor remoto. |
| 📜 **Leer un archivo** | `GET /api/files/:filename?origin=<id>` descarga el contenido vía SFTP. |
| 👁️ **Tail en vivo** | WebSocket `/ws/tail?filename=...&origin=...` transmite nuevas líneas a medida que el archivo crece. |
| 🔍 **Búsqueda global** | `POST /api/search-global` busca una cadena o regex en todos los servidores configurados. |
| 🔧 **Arreglar permisos** | `POST /api/ssh-fix-perm` ejecuta `chmod 777` (con fallback a `sudo`) si el archivo tiene permisos restrictivos. |

Los archivos remotos aparecen en el panel izquierdo con una **etiqueta de origen** coloreada (`SSH: prod-api-01`) junto a los locales.

---

## 2. Requisitos en el servidor remoto

Antes de configurar la conexión, asegúrate de que el servidor cumple con:

| Requisito | Cómo verificarlo |
|---|---|
| **SSH accesible en el puerto** (default `22`) | `ssh usuario@host` desde tu terminal |
| **Usuario con permisos de lectura** sobre los logs | `ls -la /ruta/logs/` (los `.log` deben ser legibles) |
| **SFTP habilitado** (subsystem sftp en `sshd_config`) | `grep sftp /etc/ssh/sshd_config` |
| **(Opcional) `sudo` con NOPASSWD** o contraseña guardada en LogScope | Para `chmod 777` automático si los logs tienen dueño restringido |

> 💡 **Tip**: si los logs los genera un servicio como `tomcat` o `wildfly`, normalmente están en `/opt/<app>/logs/` con permisos del usuario del servicio. LogScope puede necesitar `sudo` para leerlos.

---

## 3. Abrir el panel de SSH

1. Arranca LogScope ([Getting Started](getting-started.md)).
2. En la **barra superior**, haz clic en el icono de **⚙ Ajustes**.
3. En el modal de Ajustes, la pestaña por defecto es **Servidores SSH**.

---

## 4. Configurar una nueva conexión

En la pestaña **Servidores SSH** del modal de Ajustes, rellena el formulario:

### 4.1 Campos obligatorios

| Campo | Ejemplo | Descripción |
|---|---|---|
| **Nombre (alias)** | `prod-api-01` | Cómo lo verás en el panel lateral. Usa nombres reconocibles: `prod-api-01`, `staging-bbva`, `dev-laptop`. |
| **Host** | `10.20.30.40` o `mi-servidor.empresa.com` | IP o dominio del servidor SSH. |
| **Usuario** | `qa-deploy` | Usuario SSH (no root, salvo necesidad explícita). |
| **Puerto** | `22` (default) | Cambia solo si tu servidor corre SSH en otro puerto. |

### 4.2 Campos opcionales

| Campo | Descripción |
|---|---|
| **Carpeta de logs** | Ruta absoluta en el servidor, e.g. `/var/log/capa-media/`. Si la dejas vacía, se usa el home del usuario. |
| **Tipo de autenticación** | `password` o `privateKey`. Ver [Métodos de autenticación](#5-métodos-de-autenticación). |
| **Contraseña / Clave privada** | Se guarda cifrada (AES-256-CBC). Ver [Seguridad](security.md). |
| **Contraseña de sudo** | Necesaria solo si quieres arreglar permisos en archivos que no son tuyos. |

### 4.3 Probar la conexión

Antes de guardar, haz clic en **Probar conexión**. Debe responder en menos de 7 segundos:

- ✅ `Conexión exitosa` → puedes guardar.
- ❌ `Connection refused` → revisa host/puerto.
- ❌ `Authentication failed` → revisa usuario/credenciales.
- ❌ `Timed out` → probablemente un firewall; coordina con infra.

### 4.4 Guardar

Pulsa **Guardar**. La conexión aparecerá en la lista y los archivos del servidor remoto estarán disponibles inmediatamente en el **Explorador de Archivos** (icono de carpeta en la barra superior).

---

## 5. Métodos de autenticación

LogScope soporta dos métodos (`authType`):

### 5.1 Por contraseña (`password`)

Pega la contraseña en el campo. Se guarda cifrada.

> ✅ Simple, funciona siempre.
> ❌ Más vulnerable a fuerza bruta que una clave.

### 5.2 Por clave privada (`privateKey`)

Tienes **dos opciones** dentro de la UI:

| Opción | Cuándo usarla |
|---|---|
| **Pegar contenido de clave** | Si tienes la clave como texto plano y prefieres no referenciar un archivo. |
| **Ruta a clave** (`privateKeyPath`) | Si el backend puede leer una ruta local, e.g. `C:\Users\<user>\.ssh\id_rsa`. La clave se lee en cada conexión; no se cifra. |

> ✅ Más seguro que contraseña (y se puede proteger con passphrase adicional).
> 💡 Si tu clave tiene passphrase, actúala como contraseña **adicional** dentro del flujo (consulta la versión más reciente de la UI).

---

## 6. Guardar credenciales y cifrado

**Todas las contraseñas y claves privadas** se almacenan en `ssh_connections.json` **cifradas con AES-256-CBC**. El detalle técnico está en [Seguridad](security.md), pero el resumen es:

```text
master.key              ← clave maestra (32 bytes random, generada al primer arranque)
ssh_connections.json    ← IV:cifrado por cada campo sensible
```

> ⚠️ Si borras `master.key`, las conexiones guardadas quedan irrecuperables (no se puede descifrar). Tendrás que volver a introducir las credenciales.

---

## 7. Explorar y seleccionar archivos remotos

### 7.1 Abrir el explorador

En la barra superior, clic en el icono 📂 **Explorador**. Se abre el modal **Explorador de Archivos (Local y Remoto)**.

### 7.2 Seleccionar archivos

Cada fila muestra:

| Columna | Significado |
|---|---|
| ☑ | Casilla para multi-selección. Activa el modo **Cronología Unificada** (mezcla los archivos en una sola línea temporal). |
| Nombre | Nombre del archivo en el servidor. |
| Tamaño | Bytes (formato humano: `KB`, `MB`, `GB`). |
| Modificado | Última modificación (`mtime`). |
| Origen | Etiqueta coloreada: `Local`, `SSH: prod-api-01`. |

### 7.3 Multi-selección (Cronología Unificada)

Marca **varias casillas** para que LogScope fusione los logs ordenándolos por timestamp de manera precisa (resolución de milisegundos). Cada fila resultante mantiene visible su origen.

> Ver [Features → Cronología Unificada](features.md#1--cronología-unificada-multi-file-timeline-merging).

---

## 8. Tail (seguimiento en vivo)

LogScope puede **suscribirse a nuevas líneas** de un archivo remoto mediante WebSocket.

### 8.1 Cómo activarlo

1. Selecciona **un solo archivo** (clic sobre la fila, no la casilla).
2. Pulsa el botón **Live / Tail** (icono de play/dot) en la cabecera del visor.
3. LogScope abre un WS a `ws://localhost:3000/ws/tail?filename=...&origin=<id>`.

> ⚠️ **Importante**: el tail solo aplica a **un archivo a la vez**. Si tienes varios seleccionados, primero cierra el tail o selecciona solo uno.

### 8.2 Comportamiento

- Cada nueva línea escrita en el archivo remoto se envía al frontend en milisegundos.
- Si el archivo se trunca (`logrotate`), LogScope detecta el cambio de tamaño y **reinicia la posición a 0**.
- El indicador **LIVE** se ilumina en verde; en rojo si se perdió conexión.

---

## 9. Fix de permisos `chmod 777`

Cuando intentas abrir un archivo remoto y los permisos son demasiado restrictivos:

```text
SFTP ReadStream error: Permission denied (code 3)
```

LogScope puede intentar arreglarlo automáticamente:

### 9.1 Modo automático

Al detectar `Permission denied` durante una lectura, el backend intenta:

1. **`chmod 777 <archivo>`** como el usuario actual.
2. Si falla (exit ≠ 0) **y** tienes contraseña de sudo guardada → `sudo -S chmod 777`.
3. Si tampoco funciona → muestra un toast de error y devuelve el archivo marcado como `permDenied`.

### 9.2 Modo manual

En el **Explorador de Archivos**, cada archivo remoto tiene un botón **🔧 Fix permissions**:

1. Clic en el ícono de llave inglesa junto al archivo.
2. LogScope ejecuta el mismo flujo (chmod → sudo).
3. Toast verde si funcionó; toast rojo si necesitas configurar la `sudoPassword` en Ajustes → SSH.

### 9.3 Cuándo necesitas `sudoPassword`

Si el archivo pertenece a `root` o a otro usuario (`tomcat`, `wildfly`, `appuser`) y tu usuario SSH **no es del mismo grupo**, el chmod directo fallará con `Operation not permitted`. En ese caso:

1. Vuelve a **Ajustes → Servidores SSH**.
2. Edita la conexión y rellena **Contraseña de sudo**.
3. LogScope la usará como input a `sudo -S` por stdin (canal estándar).

> 🔐 Esta contraseña también se cifra con AES-256-CBC y se guarda en `ssh_connections.json`.

---

## 10. Búsqueda global cross-server

El atajo global **`/`** abre el modal de **Búsqueda Global**, que busca **en todos los archivos (locales y remotos)** simultáneamente.

1. Pulsa `/` en la UI (o el botón lupa).
2. Escribe la cadena o activa **regex**.
3. Resultados agrupados por archivo, con snippets de las primeras 5 coincidencias.
4. Clic en un resultado → salta al visor principal con ese archivo cargado y el match resaltado.

Internamente usa `POST /api/search-global`, que:

- Lee cada archivo local línea por línea (`readline`).
- Abre una conexión SFTP por servidor remoto y lee los archivos línea por línea.
- Devuelve el agregado ordenado.

> ⚠️ Las búsquedas remotas pueden ser lentas si el servidor tiene muchos archivos o líneas grandes. LogScope limita los snippets a 5 por archivo para mantener la respuesta rápida.

---

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El servidor no aparece en el listado | Carpeta de logs vacía o mal escrita | Verifica con `ls` por SSH manual. |
| `Connection refused` | SSH no escucha en el puerto o firewall | `Test-NetConnection -Port 22` (Win) o `nc -zv host 22` (Linux). |
| `Authentication failed` | Credenciales mal escritas o cuenta bloqueada | Prueba `ssh usuario@host` desde tu terminal. |
| `Timed out` (7s) | Red/firewall | Coordina con infra; aumenta `readyTimeout` en `server.js` si es interno. |
| `Permission denied` al leer | El usuario SSH no es dueño del archivo | Configura `sudoPassword` o usa Fix permissions. |
| `sudo chmod fails` | `sudo` no permite a tu usuario | Edita `/etc/sudoers` (con cuidado) para dar `NOPASSWD` a `chmod`. |
| Tail no actualiza | El archivo fue rotado o el proceso remoto no escribe más | LogScope reinicia posición si detecta truncamiento. |
| Explorador se queda cargando | Un servidor SSH está inaccesible | LogScope ignora el servidor caído y muestra los demás. Revisa la consola del backend (`.runtime-logs/server.err.log`). |

---

## 12. Seguridad

- **Cifrado en disco** — AES-256-CBC con IV aleatorio por cada cifrado. Ver [Seguridad](security.md).
- **Sin telemetría** — todo el tráfico SSH queda en tu red interna.
- **Sin contraseñas en el frontend** — la UI solo recibe metadatos (`hasPassword: true|false`) y nunca el contenido sensible.
- **`.gitignore`** — `ssh_connections.json`, `master.key` y similares ya están excluidos.

> Para detalles sobre el esquema criptográfico y rotación de `master.key`, lee [Seguridad](security.md).
