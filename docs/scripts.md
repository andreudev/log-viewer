# 🖥️ Scripts de Arranque (Windows)

> LogScope incluye tres scripts PowerShell pensados para simplificar el ciclo de vida del backend + frontend. Esta guía explica cuándo usar cada uno.

---

## 🎯 Resumen Rápido

| Script | Modo | Uso típico |
|---|---|---|
| [`launch.ps1`](../launch.ps1) | Arranca en background y se devuelve | **Doble clic**, atajos, abrir desde otra ventana. **Recomendado.** |
| [`start-all.ps1`](../start-all.ps1) | Arranca y mantiene la terminal bloqueada | `Ctrl+C` para detener todo a la vez. |
| [`stop-all.ps1`](../stop-all.ps1) | Detiene ambos procesos | Limpieza rápida. |

> Todos están pensados para **PowerShell 5.1+ sobre Windows**. En Linux/macOS usa los comandos `npm` documentados en [Getting Started](getting-started.md#4-arranque-manual-modo-desarrollo-interactivo).

---

## 1. `launch.ps1` — Arranque silencioso (recomendado)

Es el script principal. Diseñado para **devolver el control de la terminal de inmediato**, dejando backend y Vite corriendo en procesos ocultos.

### 1.1 Qué hace

1. Libera puertos `3000` y `5173` por si quedaron colgados.
2. Crea la carpeta `.runtime-logs/` si no existe.
3. Lanza `node server.js` y `npm run dev` con `Start-Process` (modo oculto).
4. Redirige la salida estándar/error a:
   - `.runtime-logs/server.out.log`
   - `.runtime-logs/server.err.log`
   - `.runtime-logs/vite.out.log`
   - `.runtime-logs/vite.err.log`
5. Espera hasta 30s a que ambos listen y luego imprime estado.
6. Si Vite falla al inicio, espera 8s extra por si está compilando.

### 1.2 Uso

```powershell
.\launch.ps1
```

Salida típica:

```
[launch] Iniciando backend...
[launch] Iniciando Vite...
[launch] Backend  OK  http://localhost:3000  (PID 1234)
[launch] Frontend OK  http://localhost:5173  (PID 5678)

[launch] Para detener todo: powershell -File stop-all.ps1
```

### 1.3 Cuándo usarlo

- ✅ Quieres abrir LogScope desde un **atajo del escritorio**.
- ✅ Quieres levantar la app y seguir trabajando en la misma terminal.
- ✅ Lo automatizas desde otra herramienta (Task Scheduler, VS Code task, etc.).

---

## 2. `start-all.ps1` — Arranque bloqueante

Variante que **mantiene la terminal viva** hasta que pulses `Ctrl+C`. Útil cuando quieres ver el cierre conjunto.

### 2.1 Qué hace

1. Igual que `launch.ps1` en el arranque.
2. **Espera activa** mientras los procesos hijos estén vivos.
3. Al detectar salida (al pulsar `Ctrl+C` o si un proceso muere), intenta matar al otro.

### 2.2 Uso

```powershell
.\start-all.ps1
```

Para detenerlo limpiamente: `Ctrl+C`.

### 2.3 Cuándo usarlo

- ✅ Estás depurando logs directamente en la terminal.
- ✅ Quieres un `Ctrl+C` que cierre **todo** de un golpe (no siempre funciona en `launch.ps1` por estar en background).

---

## 3. `stop-all.ps1` — Apagado limpio

Detiene cualquier proceso escuchando en los puertos `3000` o `5173`.

### 3.1 Qué hace

Para cada puerto (`3000`, `5173`):

1. Busca conexiones en estado `LISTEN`.
2. Identifica el proceso dueño vía `Win32_Process`.
3. Lo cierra con `Stop-Process -Force`.

### 3.2 Uso

```powershell
.\stop-all.ps1
```

Salida:

```
[stop-all] Cerrando PID 1234 (node.exe) en puerto 3000
[stop-all] Nada escuchando en puerto 5173
[stop-all] Listo.
```

### 3.3 Cuándo usarlo

- ✅ Algo quedó zombie y quieres forzar el cierre.
- ✅ Antes de un `launch.ps1` si sospechas de un estado raro (aunque `launch.ps1` ya limpia al inicio).

---

## 4. Logs en Vivo

Los scripts redirigen la salida a `.runtime-logs/`. Para seguirlos en tiempo real:

```powershell
Get-Content .runtime-logs\server.err.log -Wait
Get-Content .runtime-logs\vite.out.log -Wait
```

> 💡 `-Wait` mantiene la ventana abierta y va imprimiendo las nuevas líneas.

---

## 5. Variables de Entorno Reconocidas

| Variable | Default | Efecto |
|---|---|---|
| `PORT` | `3000` | Cambia el puerto del backend Express. |

Para usarla, modifica los scripts o arranca manualmente:

```powershell
$env:PORT=8080; node server.js
```

---

## 6. Solución de Problemas

| Problema | Solución |
|---|---|
| `El término 'node' no se reconoce` | Reinstala Node.js activando "Add to PATH". |
| `[launch] Backend FAIL` | Revisa `.runtime-logs/server.err.log`. |
| `[launch] Frontend FAIL` | Revisa `.runtime-logs/vite.err.log`. |
| Permiso denegado al ejecutar `.ps1` | PowerShell bloqueó el script. Ejecuta antes: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| Los procesos no se cierran con `stop-all.ps1` | Algún proceso está fuera del puerto; ciérralo desde el Administrador de Tareas. |
