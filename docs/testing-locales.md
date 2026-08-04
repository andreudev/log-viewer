# 🧪 Testing Locales

Cómo probar LogScope en tu máquina de desarrollo sin necesidad de copiar logs reales desde la máquina del trabajo.

---

## 🚀 Quick Start

```bash
# 1. Genera logs sintéticos (carpeta ../fake-logs/)
node tools/gen-fake-logs.js

# 2. Arranca el backend y Vite
npm run dev

# 3. Abre la UI
# http://localhost:5173

# 4. En la UI: Settings → Local logs dir → C:\dev\projects\fake-logs
# 5. Click en cualquier archivo .log para parsearlo
```

---

## 📁 ¿Qué se genera?

`node tools/gen-fake-logs.js` crea **13 archivos** en `C:\dev\projects\fake-logs\` (carpeta hermana del repo):

| Archivo | Formato | Qué prueba |
|---|---|---|
| `app-format-a-01.log` ... `-03.log` | Formato A (Logback/Java estándar) | Parser de logs Java, extracción de `[Class]`, `[Peticion ID]`, `[Endpoint]` |
| `capamedia-format-b-01.log` ... `-03.log` | Formato B (Entrada/Salida Capa Media) | Reconocimiento de INPUT/OUTPUT, correlation IDs |
| `soap-format-c-01.log` ... `-03.log` | Formato C (Tráfico SOAP/SSN) | Detección de SSN, payloads XML |
| `livetest-format-d-01.log` ... `-03.log` | Formato D (Java Custom / Live Test) | Parser en vivo con correlation IDs |
| `noisy-mixed.log` | Mezcla de basura y líneas sin formato | Robustez del parser ante input inválido |

**Cada formato** incluye variantes que disparan los diagnósticos de `runDiagnosis`:
- `Attempt to insert duplicate key row in object 'dbo.CLIENTES' unique index 'PK_CLIENTES_ID'` → Diagnóstico de **clave duplicada**
- `La cuenta no esta vigente en el core` → Diagnóstico de **cuenta inactiva**
- `SocketTimeoutException: Read timed out after 30000ms` → Diagnóstico de **timeout**

---

## ⚙️ Opciones del generador

```bash
# Generar 5 corridas (en lugar de las 3 por defecto)
node tools/gen-fake-logs.js --count=5

# Generar en una carpeta personalizada
node tools/gen-fake-logs.js --out=./mis-logs-prueba

# Combinado
node tools/gen-fake-logs.js --count=10 --out=D:/temp/logs-test
```

---

## 🖥️ Configurar la UI para apuntar a tus logs

1. Arranca la app: `npm run dev`
2. Abre http://localhost:5173
3. Click en el ícono de **Settings** (⚙️) en la sidebar
4. En **Local logs dir**, ingresa la ruta absoluta:
   - Por defecto: `C:\dev\projects` (carpeta padre del repo)
   - Para sintéticos: `C:\dev\projects\fake-logs`
5. Click **Save** (o el botón equivalente)
6. La sidebar se refrescará con los archivos `.log` de esa carpeta

---

## 🔄 ¿Cuándo regenerar los logs?

- **Cambiaste el parser** (`src/domain/parsing/parseLogs.ts`) → regenera para validar
- **Agregaste un nuevo patrón de diagnóstico** (`src/domain/parsing/runDiagnosis.ts`) → regenera para ver el nuevo alert
- **Probaste un fix de bug** → regenera para confirmar que el caso cubierto aparece y NO hay regresiones
- **Quieres más volumen** → `--count=10` para 40 archivos

---

## 🧹 Limpieza

```bash
# Borrar todos los logs sintéticos
Remove-Item C:\dev\projects\fake-logs\*.log -Force

# O desde Git Bash / PowerShell
rm C:/dev/projects/fake-logs/*.log
```

Los logs sintéticos **NO se trackean en git** (están en una carpeta hermana, no dentro del repo).

---

## 📝 Notas

- Los timestamps de los logs sintéticos se generan **relativos al momento de ejecución**, ordenados por mtime (más recientes primero en la sidebar).
- El generador usa `Math.random()`, así que cada ejecución produce contenido distinto.
- Los IDs de correlación son UUIDs v4 aleatorios.
- Los archivos pesan entre 1.8 KB y 9 KB; ideal para pruebas rápidas sin penalizar el rendimiento.

---

## 📚 Ver también

- [WORKFLOW-REMOTO.md](WORKFLOW-REMOTO.md) — flujo completo de desarrollo remoto
- [parsers.md](parsers.md) — los 4 formatos por defecto
- [architecture.md](architecture.md) — dónde vive el código de parsing
