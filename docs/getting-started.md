# ⚙️ Getting Started — Instalación y Puesta en Marcha

> **Para una visión general**: vuelve al [README principal](../README.md) o al [índice de documentación](INDEX.md).

---

## 1. Requisitos Previos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| **Node.js** | 16.x o superior | [Descargar](https://nodejs.org/) |
| **npm** | Incluido con Node | Verificar con `npm -v` |
| **Git** | 2.30+ | Solo si clonas el repo |
| **PowerShell** | 5.1+ (incluido en Windows) | Solo para los scripts `.ps1` |

> 💡 En Linux/macOS puedes usar los mismos comandos `bash` reemplazando los scripts PowerShell.

---

## 2. Instalación

### 2.1 Clonar el repositorio

```bash
git clone https://github.com/andreudev/log-viewer.git
cd log-viewer
```

### 2.2 Instalar dependencias

```bash
npm install
```

Esto descargará todas las dependencias declaradas en [`package.json`](../package.json):

- **Runtime**: `express`, `react`, `react-dom`, `react-virtuoso`, `ssh2`, `ws`, `openai`.
- **Dev**: `vite`, `typescript`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.

---

## 3. Arranque Rápido (Windows)

La forma más simple para arrancar todo (backend + Vite):

```powershell
.\launch.ps1
```

Esto hace lo siguiente:
1. Libera los puertos `3000` (backend) y `5173` (frontend) por si quedaron colgados.
2. Arranca `node server.js` y `npm run dev` en procesos ocultos.
3. Espera a que ambos listen y muestra las URLs.
4. Se devuelve a la terminal (no se queda colgado).

### 3.1 Salida esperada

```
[launch] Backend  OK  http://localhost:3000  (PID xxxx)
[launch] Frontend OK  http://localhost:5173  (PID yyyy)
[launch] Para detener todo: powershell -File stop-all.ps1
```

### 3.2 Apunte al navegador

👉 Abre [http://localhost:5173](http://localhost:5173).

> Si Vite no está listo en 8 segundos, revisa `.runtime-logs/vite.err.log`.

---

## 4. Arranque Manual (modo desarrollo interactivo)

Si prefieres ver los logs de los procesos en vivo:

### 4.1 Terminal 1 — Backend

```bash
node server.js
```

Por defecto escucha en el puerto **`3000`** (configurable con la variable `PORT`).

### 4.2 Terminal 2 — Frontend

```bash
npm run dev
```

Vite se levanta en [http://localhost:5173](http://localhost:5173) con **HMR** (recarga automática al editar el código).

> Para parar todo: `Ctrl+C` en ambas terminales, o ejecuta [stop-all.ps1](../stop-all.ps1).

---

## 5. Scripts npm disponibles

Definidos en [package.json](../package.json):

| Comando | Acción |
|---|---|
| `npm run dev` | Inicia Vite en modo desarrollo (HMR activo). |
| `npm run build` | Compila TypeScript + bundle de producción con Vite. |
| `npm run preview` | Sirve el build de producción localmente. |
| `npm start` | Alias de `node server.js` (solo backend). |

### 5.1 Build de producción

```bash
npm run build
```

Genera la carpeta `dist/` (si la configuras así) o `public/` con los assets optimizados. Para servirlo con Express ya integrado, simplemente:

```bash
node server.js
```

El servidor detecta automáticamente los assets en `public/` y los sirve como contenido estático.

---

## 6. Estructura tras Instalación

Tras `npm install`, el proyecto queda así:

```text
log-viewer/
├── node_modules/              # Dependencias (no versionado)
├── public/                    # Assets compilados servidos por Express
│   └── assets/                # index-*.js, index-*.css, parseWorker-*.js
├── src/                       # Código fuente TypeScript / TSX
├── docs/                      # 📚 Documentación organizada
├── server.js                  # Backend Express + WebSocket
├── package.json
├── tsconfig.json
├── vite.config.ts
├── launch.ps1                 # 🚀 Arranque limpio en Windows
├── start-all.ps1              # 🚀 Arranque + bloqueo de terminal
├── stop-all.ps1               # ⛔ Detener backend y frontend
└── README.md
```

---

## 7. Configuración Inicial

La primera vez que abras la UI, LogScope crea automáticamente:

- [`system_settings.json`](../system_settings.json) — ajustes generales (directorio local de logs, IA).
- [`ssh_connections.json`](../ssh_connections.json) — conexiones SSH configuradas (cifradas con AES-256-CBC).
- [`master.key`](../master.key) — clave maestra local para el cifrado (no versionado).

> ⚠️ Estos archivos **nunca deben subirse al repositorio**. Ya están ignorados en [`.gitignore`](../.gitignore). Ver [Seguridad](security.md) para más detalle.

---

## 8. Primer Uso

1. Abre [http://localhost:5173](http://localhost:5173).
2. En la **barra superior**, ajusta la carpeta local de logs en **Ajustes → Directorio Local**.
3. (Opcional) En **Ajustes → Servidores SSH**, da de alta servidores remotos.
4. Selecciona uno o varios archivos en la **barra lateral izquierda** y empieza a depurar.

---

## 9. Solución de Problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `EADDRINUSE` en puerto 3000 / 5173 | Otro proceso lo ocupa | Ejecuta `stop-all.ps1` y luego `launch.ps1`. |
| Frontend en blanco | Vite aún compilando | Espera 5-10s y recarga el navegador. |
| `node: command not found` | Node no está en PATH | Reinstala Node.js con la opción "Add to PATH". |
| `Permission denied` sobre logs SSH | El usuario SSH no es dueño del archivo | Ver [Conexiones SSH → Permisos](ssh-connections.md#fix-de-permisos-chmod-777). |
| Errores de TypeScript | Versión de `@types/*` desactualizada | Ejecuta `npm install` de nuevo. |

Para problemas específicos de parsers, ve a [Parsers → FAQ](parsers.md#preguntas-frecuentes).

---

## 10. Siguientes Pasos

- Lee [Conexiones SSH](ssh-connections.md) para centralizar logs de varios servidores.
- Lee [Parsers](parsers.md) si tus logs no son del formato por defecto.
- Lee [Funcionalidades](features.md) para sacarle todo el jugo a la herramienta.
