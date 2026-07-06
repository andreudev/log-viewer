# 🏛️ Arquitectura del Proyecto

> LogScope sigue una arquitectura por capas inspirada en Clean Architecture / Hexagonal. Esto facilita testear, extender y reemplazar partes sin afectar el resto.

---

## 📋 Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Capas del Frontend](#3-capas-del-frontend)
4. [Backend Express + WebSocket](#4-backend-express--websocket)
5. [Flujo de Datos Típico](#5-flujo-de-datos-típico)
6. [Workers y Parsing Asíncrono](#6-workers-y-parsing-asíncrono)
7. [Persistencia Multi-nivel](#7-persistencia-multi-nivel)
8. [Convenciones de Código](#8-convenciones-de-código)
9. [Cómo Extender la Plataforma](#9-cómo-extender-la-plataforma)

---

## 1. Visión General

```text
┌──────────────────────────────────────────────────────────────────────┐
│                            BROWSER (React)                            │
│                                                                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│   │  Presentation   │  │  Application    │  │  Domain         │      │
│   │  components/    │→ │  usecases/      │→ │  models/        │      │
│   │  hooks/         │  │  (applyFilters, │  │  parsing/       │      │
│   │  theme/         │  │   buildStats)   │  │  formatting/    │      │
│   │  utils/         │  │                 │  │  diff/          │      │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│            │                    │                    │               │
│            └──────────────┬─────┴────────────────────┘               │
│                            │                                          │
│                   ┌────────▼──────────┐                              │
│                   │  Infrastructure  │                              │
│                   │   api/  db/       │                              │
│                   └────────┬──────────┘                              │
└────────────────────────────┼─────────────────────────────────────────┘
                             │  HTTP + WebSocket
┌────────────────────────────▼─────────────────────────────────────────┐
│                       BACKEND (Node.js + Express)                    │
│  server.js                                                            │
│  • /api/files        (GET)  • /api/ssh-connections (GET/POST/DEL)    │
│  • /api/files/:name  (GET)  • /api/ssh-connections/test              │
│  • /api/settings     (GET)  • /api/ssh-fix-perm                      │
│  • /api/settings/ai/test       • /api/ai-diagnose                    │
│  • /api/replay       (POST) • /api/webhook                           │
│  • /api/search-global(POST)                                         │
│  • /ws/files         (WS)   • /ws/tail (WS)                          │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  Sistema de Archivos / SSH    │
              │  • LOCAL  (~/.logs o el dir)  │
              │  • REMOTO (ssh2 + sftp)       │
              └──────────────────────────────┘
```

---

## 2. Stack Tecnológico

### Frontend

| Capa | Tecnología |
|---|---|
| UI | React 18 + TypeScript |
| Estilos | CSS-in-JS ligero + `tokens.css` (sin Tailwind ni styled-components) |
| Estado | Hooks nativos (`useState`, `useReducer`, custom hooks) |
| Tabla | `react-virtuoso` para virtualización de filas |
| Compilación | Vite 5 + `@vitejs/plugin-react` |

### Backend

| Capa | Tecnología |
|---|---|
| HTTP | Express 4 |
| WebSocket | `ws` (librería nativa) |
| SSH | `ssh2` (Cliente + SFTP) |
| Cifrado | `node:crypto` (AES-256-CBC) |
| AI Proxy | `fetch` nativo (sin SDKs de OpenAI/Gemini, se llaman como proxy) |

### Persistencia

| Capa | Tecnología |
|---|---|
| Estado del navegador | `localStorage` (pines, parsers, tema) |
| Datos del navegador | `IndexedDB` (notas, sesiones guardadas) |
| Ajustes del servidor | `system_settings.json` |
| Conexiones SSH | `ssh_connections.json` (cifrado) |

---

## 3. Capas del Frontend

La estructura en [`src/`](../src) sigue una **separación de capas estricta** donde las dependencias solo apuntan hacia el centro (`domain`).

### 3.1 `src/domain/` — Núcleo de negocio

Pura lógica, sin React, sin fetch, sin DOM.

| Carpeta | Contenido |
|---|---|
| `domain/models/` | Tipos TypeScript: [`LogEntry.ts`](../src/domain/models/LogEntry.ts), [`ParserConfig.ts`](../src/domain/models/ParserConfig.ts), [`FilterPreset.ts`](../src/domain/models/FilterPreset.ts), [`PromotionRule.ts`](../src/domain/models/PromotionRule.ts), [`DiffLine.ts`](../src/domain/models/DiffLine.ts). |
| `domain/parsing/` | El motor real: [`parseLogs.ts`](../src/domain/parsing/parseLogs.ts), [`parseTimestamp.ts`](../src/domain/parsing/parseTimestamp.ts), [`calculateDeltas.ts`](../src/domain/parsing/calculateDeltas.ts), [`runDiagnosis.ts`](../src/domain/parsing/runDiagnosis.ts). |
| `domain/formatting/` | Pretty-printers y highlighters ([`beautifyJson.ts`](../src/domain/formatting/beautifyJson.ts), [`highlightXml.ts`](../src/domain/formatting/highlightXml.ts), etc.). |
| `domain/diff/` | Algoritmo Myers LCS en [`computeDiff.ts`](../src/domain/diff/computeDiff.ts). |
| `domain/workers/` | [`parseWorker.ts`](../src/domain/workers/parseWorker.ts) — Web Worker que ejecuta parseo pesado fuera del hilo principal. |
| `domain/utils/` | Helpers como [`diagnosticsHelper.ts`](../src/domain/utils/diagnosticsHelper.ts). |

**Regla:** este directorio **no debe importar** de `application/`, `infrastructure/`, `presentation/` ni de React.

### 3.2 `src/application/` — Casos de uso

Orquesta el dominio para resolver tareas concretas. No sabe de UI ni de red.

| Archivo | Función |
|---|---|
| [`applyFilters.ts`](../src/application/usecases/applyFilters.ts) | Aplica filtros activos sobre un array de `LogEntry`. |
| [`buildStats.ts`](../src/application/usecases/buildStats.ts) | Genera métricas para el dashboard analítico. |

### 3.3 `src/infrastructure/` — Adaptadores

Conecta la app con el "mundo exterior": red y almacenamiento.

| Carpeta | Contenido |
|---|---|
| `infrastructure/api/` | [`filesApi.ts`](../src/infrastructure/api/filesApi.ts) (REST), [`filesSocket.ts`](../src/infrastructure/api/filesSocket.ts) y [`tailSocket.ts`](../src/infrastructure/api/tailSocket.ts) (WebSocket). |
| `infrastructure/db/` | [`indexedDBHelper.ts`](../src/infrastructure/db/indexedDBHelper.ts) — wrapper de IndexedDB para sesiones y notas. |

### 3.4 `src/presentation/` — UI

Componentes React, hooks y tema visual.

| Carpeta | Contenido |
|---|---|
| `presentation/components/` | Modales, drawer, sidebar, tablas, charts SVG, selectores. Ver [Features](features.md). |
| `presentation/hooks/` | [`useLogViewerState.ts`](../src/presentation/hooks/useLogViewerState.ts) (estado global con reducer), [`useKeyboardShortcuts.ts`](../src/presentation/hooks/useKeyboardShortcuts.ts), [`useParseWorker.ts`](../src/presentation/hooks/useParseWorker.ts). |
| `presentation/theme/` | [`tokens.css`](../src/presentation/theme/tokens.css) — design tokens One Dark Pro Darker + Glassmorphism. |
| `presentation/utils/` | Helpers de formato y constantes. |

---

## 4. Backend Express + WebSocket

[`server.js`](../server.js) es un único archivo (con propósito de ser legible y audit-able) que contiene:

### 4.1 Estado global

- `LOGS_DIR` (directorio actual de logs locales, modificable vía API).
- `ENCRYPTION_KEY` (32 bytes leídos de `master.key`).
- `wss` (servidor WebSocket).

### 4.2 Helpers internos

| Helper | Función |
|---|---|
| `getRawSystemSettings()` | Lee `system_settings.json` y descifra la API key. |
| `getSystemSettings()` | Igual pero sin devolver el secreto (solo `hasAiApiKey`). |
| `saveSystemSettings(partial)` | Merge parcial y recifrado selectivo. |
| `getSshConnections()` | Lee `ssh_connections.json` descifrando cada campo sensible. |
| `saveSshConnections(conns)` | Escribe cifrando. |
| `testSshConnection(config)` | Promise wrapper sobre `ssh2.Client`. |
| `getSshFiles(config)` | Lista `.log` y `.txt` en `config.logDir`. |
| `fixRemotePermissions(config, path, opts)` | `chmod 777` con fallback a `sudo -S`. |
| `searchLocalFiles(query, isRegex)` | Lee cada archivo línea por línea. |
| `searchSshFiles(conn, query, isRegex)` | Igual pero vía SFTP. |
| `makeHttpRequest(opts)` | Usado por `/api/replay`. |
| `callAiProvider(settings, prompt, onChunk?)` | Proxy a Gemini / NVIDIA / Ollama / OpenAI-compatible. |

### 4.3 Rutas HTTP

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/files` | Lista local + todos los SSH. |
| GET | `/api/files/:filename?origin=` | Lee un archivo. SFTP si origin ≠ local. |
| POST | `/api/ssh-fix-perm` | Ejecuta `chmod 777` con sudo fallback. |
| GET | `/api/ssh-connections` | Lista conexiones (sin secretos). |
| POST | `/api/ssh-connections` | Crea o actualiza una conexión. |
| DELETE | `/api/ssh-connections/:id` | Borra una conexión. |
| POST | `/api/ssh-connections/test` | Prueba la config (sin guardar). |
| GET | `/api/settings` | Devuelve ajustes (sin secretos). |
| POST | `/api/settings` | Actualiza ajustes. |
| POST | `/api/settings/ai/test` | Prueba la integración con IA. |
| POST | `/api/ai-diagnose` | Genera diagnóstico IA en streaming. |
| POST | `/api/replay` | Reenvía HTTP para evitar CORS. |
| POST | `/api/webhook` | Proxy a Slack/Discord/Teams. |
| POST | `/api/search-global` | Búsqueda cross-server. |

### 4.4 Rutas WebSocket

| Path | Uso |
|---|---|
| `/ws/files` | Empuja la lista de archivos cuando cambia el directorio. |
| `/ws/tail?filename=&origin=` | Tail en vivo de un archivo específico. |

Ver detalles de payload y comportamiento en [API Backend](api.md).

---

## 5. Flujo de Datos Típico

```text
1. Usuario abre la app
   └── frontend arranca /api/files → renderiza sidebar
   └── abre /ws/files → recibe actualizaciones push

2. Usuario selecciona archivos
   └── /api/files/:name?origin=:id → stream del contenido
   └── parseWorker.ts corre en background → genera LogEntry[]
   └── useLogViewerState.ts los guarda en memoria + virtualiza con react-virtuoso

3. Usuario aplica filtro por nivel o correlación
   └── applyFilters.ts reduce el array
   └── LogsTable re-renderiza las filas visibles

4. Usuario hace clic en una fila
   └── DetailsDrawer.tsx abre
   └── PayloadViewer.tsx renderiza XML/JSON formateado
   └── XPathConsole.tsx evalúa expresiones sobre el payload

5. Usuario exporta / replica
   └── RequestReplay.tsx → POST /api/replay → backend sale HTTP → resultado
   └── ExporterButtons.tsx → genera Postman / JMeter / WireMock / SoapUI

6. Usuario hace búsqueda global
   └── POST /api/search-global con regex/string
   └── backend lee local + cada SSH → agrega resultados con snippets
```

---

## 6. Workers y Parsing Asíncrono

El parseo de archivos grandes (>100 MB) puede congelar el navegador. Para evitarlo:

- [`parseWorker.ts`](../src/domain/workers/parseWorker.ts) se compila con Vite (worker modules) a `parseWorker-*.js` en `public/assets/`.
- El frontend lo instancia con `new Worker(...)` desde [`useParseWorker.ts`](../src/presentation/hooks/useParseWorker.ts).
- Comunicación vía `postMessage` con mensajes `{ type: 'parse', text }` → `{ type: 'progress', pct, partial }`.
- El worker hace **un solo** `RegExp.match` por línea activa (parsers compilados al inicio).

> Esto significa que archivos de >1M de líneas se procesan sin bloquear la UI.

---

## 7. Persistencia Multi-nivel

### 7.1 En el navegador

| Llave | Qué guarda |
|---|---|
| `localStorage['pinnedLogsMap']` | Pines por archivo. |
| `localStorage['activeFileName']` | Último archivo cargado. |
| `localStorage['parsers']` | Configuración del configurador. |
| `localStorage['theme']` | Tema activo (dark/light). |
| `localStorage['wordWrap']` | Ajuste de línea. |
| `localStorage['filterPresets']` | Presets guardados. |
| `IndexedDB['notes']` | Anotaciones y sesiones guardadas. |

### 7.2 En el servidor

| Archivo | Cifrado | Notas |
|---|---|---|
| `system_settings.json` | Parcial (solo `aiApiKey`) | Validado: `localLogsDir` debe existir y ser directorio. |
| `ssh_connections.json` | AES-256-CBC | Campos `password`, `privateKeyContent`, `sudoPassword` cifrados. |
| `master.key` | N/A (es la clave) | 32 bytes random, se crea al primer arranque. |

Ver [Seguridad](security.md) para los detalles criptográficos.

---

## 8. Convenciones de Código

### 8.1 TypeScript

- **Strict mode** activado en [`tsconfig.json`](../tsconfig.json).
- Sin `any` en código nuevo (usar `unknown` o tipos propios).
- Tipos de dominio exportados desde `domain/models/`.

### 8.2 Imports

```typescript
// ✅ Path relativo con /, apuntando al archivo .ts (sin extensión).
import { LogEntry } from '../domain/models/LogEntry';
import { Sidebar } from '../presentation/components/Sidebar';

// ❌ Evitar alias absolutos (@/components/...) salvo configurar Vite.
```

### 8.3 Naming

| Elemento | Convención |
|---|---|
| Componentes | `PascalCase` (`LogsTable.tsx`) |
| Hooks | `useXxx.ts` |
| Funciones puras | `camelCase` (`parseLogs`, `beautifyJson`) |
| Constantes | `UPPER_SNAKE` (`DEFAULT_PARSERS`) |
| Tipos/Interfaces | `PascalCase` |

### 8.4 Comentarios JSDoc

Las funciones internas de `server.js` usan bloques `/** ... */` para describir su contrato. Mantén ese estilo al extender.

---

## 9. Cómo Extender la Plataforma

### 9.1 Añadir un nuevo parser de sistema

Edita `src/domain/models/ParserConfig.ts` y agrega tu `ParserConfig` al array `DEFAULT_PARSERS`. Se restaurará con "Restablecer Fábrica".

### 9.2 Añadir un endpoint HTTP

En `server.js`, sigue el patrón existente:

```javascript
app.get('/api/mi-recurso', (req, res) => {
  try {
    // tu lógica
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Y añade su adaptador en `src/infrastructure/api/filesApi.ts` (o crea un nuevo archivo allí).

### 9.3 Añadir una pestaña nueva en Settings

Edita [SettingsModal.tsx](../src/presentation/components/SettingsModal.tsx):

1. Agrega el tipo de tab en `type TabType = ...`.
2. Añade el botón en la barra lateral del modal.
3. Añade el bloque condicional al render principal.

### 9.4 Añadir un nuevo provider de IA

En `server.js` → `callAiProvider(...)`, agrega un nuevo bloque `else if (aiProvider === 'tu-provider')`. Sigue el patrón de streaming con `reader.read()` para compatibilidad.

### 9.5 Añadir un componente reutilizable

Crea el archivo en `src/presentation/components/` con TypeScript + props tipadas. Si tiene lógica, considera extraer un hook en `presentation/hooks/`.

---

## Anexo: Diagrama de capas

```text
┌──────────────────────────────┐
│ presentation/                │  ← React, CSS, modales
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ application/                 │  ← Orquestación
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ domain/                      │  ← Lógica pura, modelos
└────────┬─────────────────────┘
         ▲
         │
┌────────┴─────────────────────┐
│ infrastructure/              │  ← Fetch, IndexedDB, Worker
└──────────────────────────────┘
```

Las capas exteriores **pueden** importar de las interiores. Las interiores **nunca** importan de las exteriores.
