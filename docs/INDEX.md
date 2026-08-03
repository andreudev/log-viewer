# 📚 Documentación de LogScope

Bienvenido al centro de documentación de **LogScope v5.0**. Aquí encontrarás todas las guías, referencias técnicas y manuales organizados por tema.

---

## 🗂️ Índice de Documentos

### 🚀 Empezar aquí

| Documento | Descripción |
|---|---|
| [← Volver al README](../README.md) | Punto de entrada principal del proyecto (instalación rápida, requisitos). |
| [⚙️ Getting Started](getting-started.md) | Instalación detallada, scripts de arranque y compilación. |
| [🖥️ Scripts de Arranque](scripts.md) | Cómo usar `launch.ps1`, `start-all.ps1` y `stop-all.ps1` en Windows. |
| [🌐 Workflow Remoto](WORKFLOW-REMOTO.md) | Cómo desarrollar desde una máquina local y bajar cambios al trabajo vía Git. |
| [🧪 Testing Locales](testing-locales.md) | Cómo probar la UI con logs sintéticos sin copiar archivos reales. |

### 📖 Guías de Uso

| Documento | Descripción |
|---|---|
| [🔐 Conexiones SSH](ssh-connections.md) | Cómo conectar servidores remotos, leer logs vía SFTP y `chmod 777` con sudo automático. |
| [🧠 Configurador de Parsers](parsers.md) | Cómo crear parsers personalizados para cualquier formato de log. **(antes `GUIA_PARSER.md`)** |
| [✨ Funcionalidades](features.md) | Catálogo de todas las herramientas: UML, XPath, Replay, IA, Comparador, etc. |
| [🔒 Seguridad y Secretos](security.md) | Cómo se cifran contraseñas SSH, claves y API keys (AES-256-CBC + `master.key`). |

### 🛠️ Referencia Técnica

| Documento | Descripción |
|---|---|
| [🏛️ Arquitectura](architecture.md) | Estructura por capas (domain / application / infrastructure / presentation). |
| [🔌 API Backend](api.md) | Endpoints HTTP + WebSocket del servidor Express (`server.js`). |

---

## 🎯 Por usuario

### Soy QA / Tester
1. Lee el [README](../README.md) — instalación rápida.
2. Lee [Features](features.md) — sección *Diagramas UML*, *Replay*, *Comparador*, *Exportar Sesión*.
3. Si necesitas entender parsers: [Parsers](parsers.md).

### Soy DevOps / SRE
1. Lee [Scripts de Arranque](scripts.md).
2. Lee [Conexiones SSH](ssh-connections.md) — para centralizar logs de varios servidores.
3. Lee [Arquitectura](architecture.md) — si vas a extender el backend.

### Soy Desarrollador (extiendo el código)
1. Lee [Arquitectura](architecture.md).
2. Lee [API Backend](api.md).
3. Lee [Seguridad](security.md) antes de tocar archivos sensibles.

---

## 📝 Convenciones

- Los bloques de código con `powershell` indican comandos Windows.
- Los bloques con `bash` funcionan en Linux/macOS y WSL.
- Los badges `Sistema`, `Custom`, `Local`, `SSH` son las etiquetas visuales que verás en la UI.

---
*Última revisión: ver el historial del repositorio.*
