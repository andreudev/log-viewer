# ✨ Funcionalidades — Catálogo Completo

> Este documento lista todas las herramientas que LogScope ofrece, agrupadas por pilares. Cada ítem apunta al componente que lo implementa y al endpoint cuando aplica.

---

## 📋 Tabla de Contenidos

1. [Cronología Unificada (Multi-File Timeline Merging)](#1--cronología-unificada-multi-file-timeline-merging)
2. [Diagramas UML SVG](#2--diagramas-uml-svg)
3. [Consola XPath y JSONPath](#3--consola-xpath-y-jsonpath)
4. [Replicación y Virtualización](#4--replicación-y-virtualización)
5. [Comparador Myers LCS](#5--comparador-myers-lcs)
6. [Suite Analítica SVG](#6--suite-analítica-svg)
7. [Búsqueda Global Cross-File](#7--búsqueda-global-cross-file)
8. [Tail en Vivo (WebSocket)](#8--tail-en-vivo-websocket)
9. [Fix de Permisos Remotos](#9--fix-de-permisos-remotos)
10. [Sistema de Pines y Notas](#10--sistema-de-pines-y-notas)
11. [Exportar/Importar Sesiones QA](#11--exportarimportar-sesiones-qa)
12. [Asistente de Diagnóstico IA](#12--asistente-de-diagnóstico-ia)
13. [Reglas de Promoción](#13--reglas-de-promoción)
14. [Atajos de Teclado](#14--atajos-de-teclado)
15. [Webhooks y Alertas de Escritorio](#15--webhooks-y-alertas-de-escritorio)
16. [Concurrencia de Hilos (Threading)](#16--concurrencia-de-hilos-threading)
17. [Línea de Tiempo Interactiva](#17--línea-de-tiempo-interactiva)

---

## 1. 🕒 Cronología Unificada (Multi-File Timeline Merging)

Permite seleccionar **múltiples archivos** y fusionarlos ordenados cronológicamente con precisión de milisegundos.

| Aspecto | Detalle |
|---|---|
| Componente UI | [`FileExplorerModal.tsx`](../src/presentation/components/FileExplorerModal.tsx), [`LogsTable.tsx`](../src/presentation/components/LogsTable.tsx) |
| Lógica | [`buildStats.ts`](../src/application/usecases/buildStats.ts) + hook `useLogViewerState` |
| Persistencia | `localStorage['activeFileName']` |

### Uso

1. Clic en 📂 en la barra superior.
2. Marca las casillas de varios archivos (locales y/o remotos).
3. Los logs se cargan, parsean y mezclan en orden.
4. Cada fila tiene una **etiqueta de origen** coloreada (`Local`, `SSH: prod-01`).

---

## 2. 📊 Diagramas UML SVG

Cuando aíslas un **Correlation ID**, LogScope genera un diagrama de secuencia UML en SVG.

| Aspecto | Detalle |
|---|---|
| Componente | [`UmlDiagram.tsx`](../src/presentation/components/filters/UmlDiagram.tsx) |

### Características

- **Actores clasificados:** `Client` ➔ `Gateway` ➔ `Capa Media` ➔ `External (SOAP/ACH)`.
- **Latencias visuales:** si un paso supera los `3000ms`, se marca con `!` rojo.
- **Click en flecha** → salta a la fila y abre el drawer.
- **Exportador PlantUML** → un clic copia el markup.

---

## 3. 🧠 Consola XPath y JSONPath

Terminal integrada en el Drawer de Detalles para consultar payloads.

| Aspecto | Detalle |
|---|---|
| Componente | [`XPathConsole.tsx`](../src/presentation/components/details/XPathConsole.tsx) |

### Capacidades

- **XML:** XPath vía `DOMParser` nativo, con soporte de namespaces SOAP (`soap`, `soapenv`, `xsd`, `xsi`).
- **JSON:** JSONPath en notación puntos o brackets, con parseo tolerante a JSON relajado.
- **Resultados en vivo:** se evalúa al pulsar Enter.

---

## 4. 🚀 Replicación y Virtualización

Genera artefactos de prueba directamente desde un log.

| Aspecto | Detalle |
|---|---|
| Componente | [`RequestReplay.tsx`](../src/presentation/components/details/RequestReplay.tsx), [`ExporterButtons.tsx`](../src/presentation/components/details/ExporterButtons.tsx) |
| Endpoint replay | `POST /api/replay` (proxy HTTP para evitar CORS) |

### Formatos exportables

| Formato | Botón | Descripción |
|---|---|---|
| **Postman v2.1** | Postman | Colección JSON con petición, payload y cabeceras (`X-Correlation-ID`, `X-LogScope-Origin`). |
| **JMeter `.jmx`** | JMeter | Plantilla XML con ThreadGroup, HTTPRequest, HeaderManager. |
| **WireMock JSON** | WireMock | Stubs mapeando método, URL, headers y body. |
| **SoapUI XML** | SoapUI | Detecta SOAP vs REST y genera la estructura correcta. |

---

## 5. 🔄 Comparador Myers LCS

Visor doble columna con scroll sincronizado para comparar dos payloads.

| Aspecto | Detalle |
|---|---|
| Componente | [`CompareModal.tsx`](../src/presentation/components/CompareModal.tsx) |
| Algoritmo | [`computeDiff.ts`](../src/domain/diff/computeDiff.ts) (Myers LCS) |

### Modos

- **Payload Diff** — inserciones verdes (`+`), eliminaciones rojas (`-`).
- **Header & Meta Diff** — compara cabeceras, latencias, hilo, clase y archivo origen.

> Activar con la tecla <kbd>c</kbd> tras tener **2 logs** en la cola.

---

## 6. 📈 Suite Analítica SVG

Tres visualizaciones interactivas.

| Aspecto | Detalle |
|---|---|
| Componente | [`AnalyticsDashboard.tsx`](../src/presentation/components/AnalyticsDashboard.tsx) |
| Generación | [`buildStats.ts`](../src/application/usecases/buildStats.ts) |

### Vistas

| Vista | Tipo | Interacción |
|---|---|---|
| **Histograma de Latencias** | Barras | Click en columna → filtra logs por ese rango. |
| **Donut de Errores por Servicio** | SVG Donut | Click en segmento → aísla ese servicio. |
| **Auditoría CSV** | Botón | Descarga CSV ejecutivo con métricas. |

---

## 7. 🔍 Búsqueda Global Cross-File

Atajo **`/`** abre búsqueda en todos los archivos (locales + SSH).

| Aspecto | Detalle |
|---|---|
| Componente | [`GlobalSearchModal.tsx`](../src/presentation/components/GlobalSearchModal.tsx) |
| Endpoint | `POST /api/search-global` |

### Capacidades

- Búsqueda por **cadena** o **regex** (toggle).
- Devuelve hasta **5 snippets** por archivo.
- Click en resultado → salta al visor principal y resalta el match.

---

## 8. 👁️ Tail en Vivo (WebSocket)

Sigue nuevas líneas en tiempo real.

| Aspecto | Detalle |
|---|---|
| Endpoint | `WS /ws/tail?filename=...&origin=...` |
| Componente | [`TailIndicator.tsx`](../src/presentation/components/TailIndicator.tsx) |

> Importante: el tail aplica **solo a un archivo** a la vez. Requiere seleccionarlo como único activo.

Ver [Conexiones SSH → Tail](ssh-connections.md#8-tail-seguimiento-en-vivo).

---

## 9. 🔧 Fix de Permisos Remotos

Cuando un archivo remoto tiene permisos restrictivos, LogScope puede aplicar `chmod 777` con fallback a `sudo`.

| Aspecto | Detalle |
|---|---|
| Endpoint | `POST /api/ssh-fix-perm` |
| UI | Botón 🔧 en el Explorador |

### Modos

1. **Automático** — al recibir `Permission denied` en una lectura SFTP, el backend intenta `chmod 777`; si falla y hay `sudoPassword`, escala.
2. **Manual** — clic en el ícono de llave inglesa en el Explorador de Archivos.

Ver [Conexiones SSH → Fix de permisos](ssh-connections.md#9-fix-de-permisos-chmod-777).

---

## 10. 📌 Sistema de Pines y Notas

Marca logs importantes y anota contexto.

| Aspecto | Detalle |
|---|---|
| Componente | [`AnnotationPopover.tsx`](../src/presentation/components/AnnotationPopover.tsx), [`PinnedLogsModal.tsx`](../src/presentation/components/PinnedLogsModal.tsx), [`NotesManagerModal.tsx`](../src/presentation/components/NotesManagerModal.tsx) |
| Persistencia | `localStorage['pinnedLogsMap']` + `IndexedDB['notes']` |
| Atajo | <kbd>p</kbd> para pinear/despinear la fila seleccionada |

### Pines

- Activa con <kbd>p</kbd> sobre la fila.
- Cada pin guarda: `{ correlationId, message, lineNumber, fileName, timestamp }`.
- Visibles en el modal **Pines** y se incluyen en sesiones exportadas.

### Notas

- Anotación libre (markdown ligero) sobre un log específico.
- Se almacenan en IndexedDB (gran capacidad, no sincronizan entre equipos).
- Se incluyen en el contexto del Asistente IA cuando diagnosticas un log.

---

## 11. 💾 Exportar/Importar Sesiones QA

Comparte el estado de tu análisis con un compañero.

| Aspecto | Detalle |
|---|---|
| Endpoint de exportación | generado cliente (sin backend específico) |
| Formato | `logscope_session_[fecha].json` |

### Qué incluye

- Lista de archivos cargados (paths o IDs SSH, sin contenido).
- Filtros aplicados.
- Pines.
- Parsers personalizados (de sistema + custom).
- Anotaciones y notas.
- Correlation ID actualmente aislado.

### Importar

Arrastra el `.json` sobre el botón **Cargar Sesión** y LogScope restaura todo.

> Las contraseñas SSH **nunca** se exportan. El receptor debe tener sus propias conexiones configuradas.

---

## 12. 🤖 Asistente de Diagnóstico IA

Genera análisis técnicos profesionales sobre cualquier log.

| Aspecto | Detalle |
|---|---|
| Endpoint | `POST /api/ai-diagnose` (streaming) |
| Componente | [`SmartDiagnosticAlert.tsx`](../src/presentation/components/details/SmartDiagnosticAlert.tsx) |
| Configuración | Settings → pestaña **IA** |
| Llamador | `callAiProvider()` en `server.js` |

### Proveedores soportados

| Provider | Necesita | Endpoint |
|---|---|---|
| `gemini` | API key | `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent` |
| `nvidia` | API key (opcional) | configurable vía `aiEndpoint` |
| `ollama` | — | `http://localhost:11434/api/generate` típico |
| `openai-compatible` | API key | DeepSeek, OpenRouter, etc. |
| `custom-json` | API key | cualquier endpoint tipo `/chat/completions` |

### Estructura del diagnóstico

1. **Análisis de la Falla**
2. **Causas Probables**
3. **Impacto Estimado**
4. **Soluciones Recomendadas**

> 💡 La IA recibe el log + el ID + timestamp + clase + thread + la anotación del analista.

---

## 13. ⚙️ Reglas de Promoción

Permiten **forzar un nivel** (e.g. `WARN → ERROR`) o **inyectar tags** automáticamente según regex.

| Aspecto | Detalle |
|---|---|
| Componente | [`RulesModal.tsx`](../src/presentation/components/RulesModal.tsx) |
| Modelo | [`PromotionRule.ts`](../src/domain/models/PromotionRule.ts) |

### Casos de uso

- Marcar automáticamente como `ERROR` cualquier log cuyo mensaje contenga `DownstreamTimeout`.
- Promover todo lo del correlation `TXN-CRASH-*` para resaltarlos visualmente.
- Etiquetar como `SECURITY` cualquier línea con palabras sensibles.

---

## 14. ⌨️ Atajos de Teclado

| Tecla | Acción |
|:---:|---|
| <kbd>j</kbd> | Siguiente fila de la tabla |
| <kbd>k</kbd> | Fila anterior |
| <kbd>p</kbd> | Pin / unpin en la fila seleccionada |
| <kbd>c</kbd> | Abrir comparador (requiere 2 filas seleccionadas) |
| <kbd>/</kbd> | Enfocar búsqueda global |
| <kbd>Esc</kbd> | Cerrar drawer / modal activo |

Ver [`useKeyboardShortcuts.ts`](../src/presentation/hooks/useKeyboardShortcuts.ts).

---

## 15. 📣 Webhooks y Alertas de Escritorio

Notifica a canales externos cuando algo importante aparece.

| Aspecto | Detalle |
|---|---|
| Endpoint | `POST /api/webhook` (proxy genérico) |
| Componente | [`SettingsModal.tsx`](../src/presentation/components/SettingsModal.tsx) (pestaña Webhooks) |

### Webhooks

- **Tipos**: Slack, Discord, Microsoft Teams.
- LogScope hace `POST` al `webhookUrl` formateando el payload según el tipo.
- El proxy en `/api/webhook` evita restricciones de CORS del navegador.

### Alertas de escritorio

- Usan la API `Notification` nativa del navegador.
- Activar/Desactivar en Ajustes → pestaña **Alertas**.
- LogScope dispara una cuando aparece un log que cumple una regla que hayas marcado.

---

## 16. 🧵 Concurrencia de Hilos (Threading)

Visualiza la actividad de threads en sistemas concurrentes.

| Aspecto | Detalle |
|---|---|
| Componente | [`ThreadConcurrencyDashboard.tsx`](../src/presentation/components/analytics/ThreadConcurrencyDashboard.tsx) |
| Origen | `LogEntry.thread` (configurado en el parser) |

### Capacidades

- Cuenta de logs por thread en la ventana visible.
- Detección de **deadlocks** aparentes (threads que esperan >5s sin progresar).
- Click en un thread → filtra la tabla principal.

---

## 17. 📈 Línea de Tiempo Interactiva

Visualización tipo scatterplot para detectar patrones temporales (picos de error, gaps de silencio).

| Aspecto | Detalle |
|---|---|
| Componente | [`LogTimeline.tsx`](../src/presentation/components/filters/LogTimeline.tsx) |

### Capacidades

- Cada punto es un log, color por nivel.
- Drag horizontal para zoom a un rango.
- Click + drag para selección rectangular → filtra múltiples puntos.
- Toggle **Errores only** para ver solo `ERROR`/`FATAL`.

---

## Resumen de Componentes

| Carpeta | Componente | Función principal |
|---|---|---|
| `components/` | `LogsTable` | Tabla virtualizada |
| `components/` | `DetailsDrawer` | Drawer de detalles con payload |
| `components/` | `FiltersPanel` | Barra de filtros |
| `components/` | `Sidebar` | Barra lateral con lista de archivos |
| `components/details/` | `ExporterButtons` | Botones Postman/JMeter/WireMock/SoapUI |
| `components/details/` | `PayloadViewer` | Render con syntax highlight |
| `components/details/` | `RequestReplay` | Reintentar petición HTTP |
| `components/details/` | `SmartDiagnosticAlert` | Streaming IA |
| `components/details/` | `XPathConsole` | XPath / JSONPath |
| `components/filters/` | `UmlDiagram` | Diagrama de secuencia |
| `components/filters/` | `LogTimeline` | Scatterplot temporal |
| `components/filters/` | `DateRangePicker` | Selector de rango de fechas |
| `components/filters/` | `QuickFilterPills` | Filtros pre-armados |
| `components/analytics/` | `ThreadConcurrencyDashboard` | Visor de concurrencia |

---

## Atajos Rápidos → Documento

| Tarea | Guía |
|---|---|
| Configurar una conexión SSH | [Conexiones SSH](ssh-connections.md) |
| Crear un parser nuevo | [Parsers](parsers.md) |
| Entender dónde vive el código | [Arquitectura](architecture.md) |
| Cifrado de secretos | [Seguridad](security.md) |
| Arrancar la app | [Getting Started](getting-started.md) |