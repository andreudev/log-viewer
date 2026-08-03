# 🔍 LogScope v5.0 — Analizador de Logs & Suite de Diagnóstico Premium

Bienvenido a **LogScope v5.0**, la herramienta definitiva de auditoría, diagnóstico y replicación de pruebas de rendimiento para ingenieros de QA y desarrolladores de Capa Media.

Diseñada bajo una estética moderna, fluida y con estilo **Glassmorphism** (basada en la paleta *One Dark Pro Darker*), LogScope transforma trazas de log planas y complejas en flujos de datos estructurados, interactivos y accionables.

---

## 🚀 Quick Start

```powershell
# 1. Clonar
git clone https://github.com/andreudev/log-viewer.git
cd log-viewer

# 2. Instalar dependencias
npm install

# 3. Arrancar (Windows)
.\launch.ps1

# Abre http://localhost:5173 en tu navegador
```

> Más detalles en [⚙️ Getting Started](docs/getting-started.md).

---

## ✨ Pilares de la Plataforma

### 1. 📂 Cronología Unificada Multi-Archivo
Fusiona múltiples archivos `.log/.txt` (locales **y remotos vía SSH**) en un único flujo ordenado con precisión de milisegundos, con etiqueta de origen coloreada por archivo/servidor.

### 2. 📊 Diagramas UML SVG Interactivos
Al aislar un Correlation ID, se genera un diagrama de secuencia clasificando los actores (`Client` ➔ `Gateway` ➔ `Capa Media` ➔ `External`). Las llamadas >3s se marcan en rojo. Clic en una flecha salta al log.

### 3. 🧠 Consola XPath & JSONPath
Terminal integrada en el Drawer. Soporta namespaces SOAP (`soap`, `soapenv`, `xsd`, `xsi`) y JSON tolerante a errores. Sin dependencias externas.

### 4. 🚀 Replicación & Mocking
Genera en un clic colecciones de **Postman v2.1**, planes **Apache JMeter (.jmx)**, stubs **WireMock** o proyectos **SoapUI (.xml)**. Todo desde el log real.

### 5. 🔄 Comparador Myers LCS
Visor doble columna con scroll sincronizado. Compara payloads y metadatos (cabeceras, latencia, hilo, clase).

### 6. 🔐 Logs vía SSH/SFTP
Múltiples servidores remotos con cifrado AES-256-CBC. **Fix de permisos** automático (`chmod 777` con `sudo` fallback). **Tail en vivo** por WebSocket.

### 7. 🤖 Asistente IA Multi-Provider
Diagnóstico técnico estructurado (Análisis → Causas → Impacto → Soluciones). Soporta **Gemini**, **NVIDIA NIM**, **Ollama** y cualquier endpoint **OpenAI-compatible**.

### 8. 📈 Suite Analítica SVG
Histograma de latencias, donut de errores por servicio, auditoría CSV ejecutiva. Clic en segmento → filtra la tabla.

### 9. 📌 Pines, Notas y Sesiones QA
Marca logs con <kbd>p</kbd>, anota contexto y exporta la sesión completa a un `.json` que un compañero puede restaurar arrastrándolo a su UI.

### 10. 🧵 Concurrencia de Hilos + Línea de Tiempo
Detecta threads colgados y patrones temporales de errores con scatterplots interactivos.

---

## 📚 Documentación

Toda la documentación está organizada en [`docs/`](docs/INDEX.md):

| Documento | Descripción |
|---|---|
| [📚 Índice](docs/INDEX.md) | Punto de entrada a toda la documentación. |
| [⚙️ Getting Started](docs/getting-started.md) | Instalación detallada y solución de problemas. |
| [🖥️ Scripts de Arranque](docs/scripts.md) | `launch.ps1`, `start-all.ps1`, `stop-all.ps1`. |
| [🔐 Conexiones SSH](docs/ssh-connections.md) | **Guía completa para centralizar logs remotos.** |
| [🧠 Configurador de Parsers](docs/parsers.md) | Cómo crear parsers personalizados. |
| [✨ Funcionalidades](docs/features.md) | Catálogo detallado de cada herramienta. |
| [🏛️ Arquitectura](docs/architecture.md) | Capas, componentes y convenciones. |
| [🔒 Seguridad](docs/security.md) | Cifrado AES-256-CBC y manejo de secretos. |
| [🔌 API Backend](docs/api.md) | Referencia HTTP y WebSocket. |

> 📌 La antigua **`GUIA_PARSER.md`** está obsoleta; usa [docs/parsers.md](docs/parsers.md).

---

## ⌨️ Atajos de Teclado

| Tecla | Acción |
|:---:|---|
| <kbd>j</kbd> | Siguiente fila |
| <kbd>k</kbd> | Fila anterior |
| <kbd>p</kbd> | Pin / unpin |
| <kbd>c</kbd> | Comparador (con 2 filas seleccionadas) |
| <kbd>/</kbd> | Búsqueda global |
| <kbd>Esc</kbd> | Cerrar drawer/modal |

---

## 🛠️ Stack

**Frontend:** React 18 · TypeScript · Vite · `react-virtuoso` · CSS tokens (Glassmorphism)
**Backend:** Node.js · Express 4 · `ws` (WebSocket) · `ssh2` (SFTP) · `node:crypto` (AES-256-CBC)
**Persistencia:** `localStorage` · IndexedDB · `system_settings.json` · `ssh_connections.json`

---

## 🔒 Seguridad

- **AES-256-CBC** con IV aleatorio para contraseñas SSH, claves privadas y API keys. Ver [docs/security.md](docs/security.md).
- **Nunca** se suben al repositorio: `master.key`, `ssh_connections.json`, `system_settings.json`. Listado completo en `.gitignore`.
- **En el frontend** solo se exponen metadatos (`hasPassword: true`); los secretos no viajan al navegador.

---

## 🛠️ Estructura

```text
log-viewer/
├── docs/                      # 📚 Documentación organizada
├── public/                    # Assets compilados
├── src/
│   ├── application/          # Casos de uso (filtros, stats)
│   ├── domain/               # Modelos, parsers, formatters, diff
│   │   ├── parsing/          # parseLogs, parseTimestamp
│   │   ├── formatting/      # highlight JSON/XML, beautifyJson
│   │   ├── diff/             # Myers LCS
│   │   └── workers/          # parseWorker (Web Worker)
│   ├── infrastructure/       # api/, db/ (IndexedDB)
│   └── presentation/         # Componentes React, hooks, tema
├── server.js                 # Express + WS + ssh2
├── package.json
├── vite.config.ts
├── launch.ps1                # Arranque silencioso
├── start-all.ps1             # Arranque bloqueante
├── stop-all.ps1              # Detener
└── README.md
```

Detalles en [docs/architecture.md](docs/architecture.md).

---

## 📦 Scripts npm

```bash
npm run dev       # Vite dev server (HMR)
npm run build     # Build de producción
npm run preview   # Servir el build
npm start         # node server.js (solo backend)
```

---

## 🛠️ Desarrollo Remoto y Testing

Si vas a desarrollar desde una máquina distinta a donde corre LogScope en producción, revisa:

- [🌐 Workflow Remoto](docs/WORKFLOW-REMOTO.md) — branching, push/pull, sincronización entre máquinas, rollback
- [🧪 Testing Locales](docs/testing-locales.md) — generador de logs sintéticos (`tools/gen-fake-logs.js`) para probar sin archivos reales

El proyecto incluye un **pre-commit hook** en `.githooks/` que bloquea automáticamente cualquier intento de subir secretos (SSH passwords, API keys, certificados). Actívalo con:

```bash
git config core.hooksPath .githooks
```

---

## 🤝 Contribuciones

Por ahora es un proyecto interno. Si encuentras un bug o quieres proponer una mejora, abre un issue describiendo:

1. Pasos para reproducir.
2. Resultado esperado vs. observado.
3. Logs de `server.err.log` si aplica.

---

## 📜 Licencia

ISC — ver [`package.json`](package.json).

---
*Desarrollado con pasión para ingenieros de Capa Media. LogScope v5.0.*
