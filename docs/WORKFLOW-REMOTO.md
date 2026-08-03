# 🌐 Workflow de Desarrollo Remoto

Esta guía describe el flujo de trabajo recomendado cuando se desarrolla LogScope desde una máquina local (con VS Code + Copilot) y se quieren bajar los cambios a una máquina remota (típicamente el equipo del trabajo donde corre el servicio).

---

## 🎯 Escenario típico

- **Máquina local**: tiene VS Code con acceso a GitHub y al chat agentico de Copilot. Aquí se escribe código, se commitea, se hace push.
- **Máquina remota (trabajo)**: ejecuta LogScope sirviendo logs reales. Aquí se hace `git pull` y se reinicia el servicio.

---

## 🌿 Estrategia de Ramas

```
master            ← producción estable (lo que corre en la máquina del trabajo)
  ↑
develop           ← integración local
  ↑
fix/*             ← corrección de bugs específicos
feat/*            ← nuevas funcionalidades
refactor/*        ← limpieza interna sin cambio de comportamiento
```

### Convenciones

- **NUNCA** se commitea directo a `master` o `develop`.
- Cada cambio (un bugfix, una feature, un refactor) va en su propia rama.
- Nombres en **kebab-case**: `fix/ssh-permission-denied`, `feat/export-csv-timezone`, `refactor/sidebar-extract-hooks`.

---

## 🚀 Flujo "Trabajar Aquí" (máquina local con Copilot)

1. **Asegúrate de estar en `develop` actualizado**:
   ```bash
   git checkout develop
   git pull
   ```

2. **Crea una rama para tu cambio**:
   ```bash
   git checkout -b fix/mi-bug
   ```

3. **Trabaja normalmente**: edita archivos, prueba, commitea.
   - Commits con [Conventional Commits](https://www.conventionalcommits.org/):
     ```
     fix(server): manejar error de timeout en SFTP
     feat(ui): agregar filtro por rango de fechas
     refactor(parser): extraer regex a constante
     ```
   - El hook `pre-commit` bloqueará automáticamente cualquier intento de subir secretos.

4. **Push al remoto**:
   ```bash
   git push -u origin fix/mi-bug
   ```

5. **Abre un PR contra `develop`** desde GitHub (opcional pero recomendado para trazabilidad).

6. **Merge a `develop`** cuando esté aprobado:
   ```bash
   git checkout develop
   git merge --no-ff fix/mi-bug
   git push origin develop
   ```

7. **Borra la rama feature** si ya no la necesitas:
   ```bash
   git branch -d fix/mi-bug
   git push origin --delete fix/mi-bug
   ```

---

## 📥 Flujo "Bajar al Trabajo" (máquina remota)

### Cuando estés listo para probar cambios en producción

1. **Conéctate a la máquina del trabajo** (RDP, SSH, o lo que uses).

2. **Ve a la carpeta del repo**:
   ```powershell
   cd C:\ruta\al\repo\log-viewer
   ```

3. **Sincroniza `master`**:
   ```powershell
   git checkout master
   git pull
   ```

4. **Merge de `develop` a `master`** (fast-forward si es posible):
   ```powershell
   git merge develop --ff-only
   ```
   - Si NO es fast-forward (porque `master` tiene commits que `develop` no tiene):
     ```powershell
     git merge develop --no-ff
     ```
     y resuelve conflictos manualmente.

5. **Push a `master` en el remoto**:
   ```powershell
   git push origin master
   ```

6. **Reinicia el servicio**:
   ```powershell
   .\stop-all.ps1
   .\start-all.ps1
   ```

7. **Verifica que funciona**:
   - Abre `http://localhost:5173` en el navegador.
   - Revisa los logs en `.runtime-logs/server.err.log` por si hay errores de arranque.

---

## ↩️ Rollback

Si después de bajar cambios al trabajo algo se rompe:

### Opción A: Revertir el último commit en `master`

```powershell
git checkout master
git revert HEAD
git push origin master
.\stop-all.ps1
.\start-all.ps1
```

Esto genera un commit nuevo que deshace los cambios (no reescribe historial). Es lo más seguro si otras personas también clonan `master`.

### Opción B: Hard reset (solo si estás seguro)

```powershell
git checkout master
git reset --hard HEAD~1
git push --force origin master
.\stop-all.ps1
.\start-all.ps1
```

⚠️ `--force` reescribe el historial. **No usar** si alguien más clonó `master`.

---

## 🔒 Política de Secretos

**Nunca subas al repositorio**:

| Patrón | Qué es |
|---|---|
| `master.key` | Clave AES-256-CBC para descifrar configs |
| `*.key` | Cualquier clave |
| `ssh_connections.json` | Configs SSH cifradas (passwords, private keys) |
| `system_settings.json` | AI API keys, paths locales |
| `conn-*.json` / `fix-perm-*.json` | Archivos auxiliares generados por SSH |
| `*.pem`, `*.env`, `*.pfx`, `*.p12` | Certificados y variables de entorno |

### Doble red de seguridad

1. **`.gitignore`** evita que git trackee estos archivos (si son nuevos).
2. **`.githooks/pre-commit`** bloquea cualquier intento de `git add -f` con mensaje claro.

Si necesitas añadir un secreto legítimo (por ejemplo, `.env.example`):

- Renómbralo a un nombre que NO matchee los patrones (`*.example` está OK).
- O usa `git commit --no-verify` solo cuando estés 100% seguro.

---

## 🛠️ Setup Inicial (solo la primera vez)

### 1. Clonar el repo

```bash
git clone https://github.com/andreudev/log-viewer.git
cd log-viewer
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar git hooks

```bash
git config core.hooksPath .githooks
```

### 4. Configurar identidad (si no la tenías)

```bash
git config user.name "Tu Nombre"
git config user.email "tu@email.com"
```

### 5. Autenticación GitHub (Windows)

1. Crea un **Personal Access Token** en https://github.com/settings/tokens/new
   - Note: `log-viewer-dev (Windows local)`
   - Expiration: 90 días
   - Scopes: solo `repo`
2. Configura el credential helper:
   ```bash
   git config --global credential.helper manager
   ```
3. La primera vez que hagas `git push`, te pedirá username y password. Usa el token como password. Windows Credential Manager lo guardará automáticamente.

### 6. (Opcional) Generar logs sintéticos para pruebas

```bash
node tools/gen-fake-logs.js
```

Esto crea `C:\dev\projects\fake-logs\` con 13 archivos `.log` que cubren los 4 formatos del parser.

---

## ❓ Troubleshooting

### "Mi commit fue bloqueado por el hook"

El hook detectó un patrón de secreto. Si el archivo es legítimo, renómbralo (ej: `.env.example`) o usa `--no-verify` con cuidado.

### "Mi push pide credenciales cada vez"

Tu token no se guardó. Verifica:
```bash
git config --global credential.helper manager
```
Y borra credenciales viejas del Credential Manager de Windows.

### "Merge develop→master no es fast-forward"

Tienes commits en `master` que no están en `develop`. Opciones:
- `git merge develop --no-ff` (preserva ambos historiales)
- O primero trae los commits de `master` a `develop`:
  ```bash
  git checkout develop
  git merge master --no-ff
  git push origin develop
  git checkout master
  git merge develop --ff-only
  git push origin master
  ```

### "Necesito rehacer el setup desde cero"

```bash
cd C:\dev\projects\log-viewer
git remote remove origin
git remote add origin https://github.com/andreudev/log-viewer.git
git config core.hooksPath .githooks
```

---

## 📚 Ver también

- [Getting Started](getting-started.md) — instalación y compilación
- [Architecture](architecture.md) — cómo está organizado el código
- [Security](security.md) — cifrado AES-256-CBC y `master.key`
