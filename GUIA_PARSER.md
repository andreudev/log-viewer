# 🛠️ Guía Completa: Configurador de Parsers de LogScope

> **Objetivo**: Enseñarte paso a paso cómo funciona el modal **"Estructura de Log y Parsers Personalizados"**, qué significa cada campo, y cómo crear tus propios parsers para cualquier formato de log que encuentres.

---

## 📖 Tabla de Contenidos

1. [¿Qué es un Parser?](#1-qué-es-un-parser)
2. [Cómo abrir el modal](#2-cómo-abrir-el-modal)
3. [Anatomía del Modal](#3-anatomía-del-modal)
4. [Panel Izquierdo: Lista de Parsers](#4-panel-izquierdo-lista-de-parsers)
5. [Panel Derecho: Editor del Parser](#5-panel-derecho-editor-del-parser)
6. [Concepto Clave: Expresiones Regulares con Grupos de Captura](#6-concepto-clave-expresiones-regulares-con-grupos-de-captura)
7. [Mapeo de Grupos de Captura](#7-mapeo-de-grupos-de-captura)
8. [Extracciones Secundarias (Regex sobre el Mensaje)](#8-extracciones-secundarias-regex-sobre-el-mensaje)
9. [Probador de Regex en Vivo](#9-probador-de-regex-en-vivo)
10. [Ejercicio Práctico 1: Formato Spring Boot](#10-ejercicio-práctico-1-formato-spring-boot)
11. [Ejercicio Práctico 2: Formato Apache Access Log](#11-ejercicio-práctico-2-formato-apache-access-log)
12. [Ejercicio Práctico 3: Formato CSV / Delimitado](#12-ejercicio-práctico-3-formato-csv--delimitado)
13. [Preguntas Frecuentes y Resolución de Problemas](#13-preguntas-frecuentes-y-resolución-de-problemas)

---

## 1. ¿Qué es un Parser?

Un **parser** (analizador) es un conjunto de reglas que le dicen a LogScope **cómo leer y descomponer** cada línea de texto de un archivo de log en campos estructurados.

Sin un parser adecuado, LogScope ve cada línea como texto plano sin significado. Con un parser correctamente configurado, LogScope puede:

- 🕐 Extraer la **fecha y hora** exacta de cada evento
- 🚦 Identificar el **nivel de severidad** (INFO, ERROR, WARN, etc.)
- 💬 Aislar el **mensaje** del evento
- 🔗 Detectar el **ID de correlación** para rastrear flujos completos
- 🏷️ Reconocer la **clase** o módulo que generó el log
- 🌐 Identificar el **servicio** o endpoint involucrado
- 🧵 Capturar el **hilo de ejecución** (thread)

> [!IMPORTANT]
> LogScope ya incluye 3 parsers de sistema preconfigurados para los formatos estándar de Capa Media. Solo necesitas crear parsers personalizados si tus logs usan un formato diferente.

---

## 2. Cómo abrir el modal

1. Abre LogScope en tu navegador (`http://localhost:3000` o `http://localhost:5173` en modo dev)
2. En la **barra superior** de la aplicación, busca el botón con ícono de engranaje:

   **⚙ Estructura de Log (Parsers)**

3. Haz clic en él. Se abrirá el modal de configuración a pantalla completa.

---

## 3. Anatomía del Modal

El modal está dividido en **dos paneles principales**:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙ Estructura de Log y Parsers Personalizados         [X]  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  PANEL       │  PANEL DERECHO                               │
│  IZQUIERDO   │  (Editor del parser seleccionado)            │
│              │                                              │
│  Lista de    │  ┌─ Nombre del Formato                       │
│  parsers     │  ├─ Expresión Regular Principal              │
│  activos     │  ├─ Mapeo de Grupos de Captura               │
│              │  ├─ Extracciones Secundarias                  │
│  [+ Nuevo]   │  └─ 🐛 Probador en Vivo                     │
│              │                                              │
├──────────────┤                                              │
│ [Restablecer │                                              │
│   Fábrica]   │                                              │
└──────────────┴──────────────────────────────────────────────┘
│                    [Listo / Cerrar]                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Panel Izquierdo: Lista de Parsers

Este panel muestra todos los parsers disponibles. Cada parser tiene:

### Elementos de cada tarjeta

| Elemento | Descripción |
|----------|-------------|
| **Nombre** | Nombre descriptivo del parser (ej. "Formato A: Logback/Log4j") |
| **Etiqueta SISTEMA / CUSTOM** | 🔵 `SISTEMA` = preconfigurado, no editable. 🟡 `CUSTOM` = creado por ti, totalmente editable. |
| **Checkbox ☑** | Activa o desactiva el parser. Un parser desactivado será ignorado al procesar los logs. |
| **Ícono 🗑️** | Solo en parsers CUSTOM. Elimina permanentemente el parser. |

### Botones del panel

| Botón | Acción |
|-------|--------|
| **+ Nuevo** | Crea un parser personalizado en blanco con una regex de ejemplo |
| **🔄 Restablecer Fábrica** | Elimina todos los parsers personalizados y restaura solo los 3 parsers de sistema originales |

### ¿Cómo funciona el orden?

> [!NOTE]
> LogScope prueba los parsers **en orden de arriba hacia abajo**. La primera regex que coincida con una línea de log es la que se usa para parsearla. Si ningún parser coincide, la línea se trata como texto plano con nivel `INFO`.

---

## 5. Panel Derecho: Editor del Parser

Al hacer clic en un parser de la lista izquierda, su configuración aparece aquí. Tiene las siguientes secciones:

### 5.1 Cabecera

- **Título**: Muestra `Configurando: [nombre]` para parsers CUSTOM o `Visualizando: [nombre]` para parsers de SISTEMA (solo lectura).
- **ID de Registro**: Identificador interno único del parser (no modificable).
- **Botón "Guardar Cambios"**: Solo aparece en parsers CUSTOM. **Debes hacer clic aquí para que los cambios se apliquen.**

### 5.2 Nombre del Formato

Un nombre descriptivo para identificar tu parser. Elige algo claro como:
- ✅ `Spring Boot Microservicios`
- ✅ `Apache Access Log (Combined)`
- ✅ `Log personalizado del sistema X`
- ❌ `Parser 1` ← poco descriptivo

### 5.3 Expresión Regular Principal (Regex)

> [!IMPORTANT]
> **Esta es la parte más importante del parser.** La regex define la estructura completa de una línea de log y qué partes extraer.

Se explica en detalle en la [Sección 6](#6-concepto-clave-expresiones-regulares-con-grupos-de-captura).

### 5.4 Mapeo de Grupos de Captura

Aquí defines **qué grupo de la regex corresponde a qué columna** del visor de logs. Se explica en la [Sección 7](#7-mapeo-de-grupos-de-captura).

### 5.5 Extracciones Secundarias

Regex opcionales que se aplican **sobre el mensaje** ya extraído para obtener datos adicionales. Se explica en la [Sección 8](#8-extracciones-secundarias-regex-sobre-el-mensaje).

### 5.6 Probador en Vivo

Un campo de prueba interactivo donde puedes pegar líneas de log reales y verificar si la regex las parsea correctamente. Se explica en la [Sección 9](#9-probador-de-regex-en-vivo).

---

## 6. Concepto Clave: Expresiones Regulares con Grupos de Captura

### ¿Qué es una Expresión Regular (Regex)?

Una regex es un **patrón de texto** que describe la estructura de una cadena. LogScope la usa para reconocer y descomponer las líneas de log.

### ¿Qué son los Grupos de Captura?

Los paréntesis `( )` dentro de una regex definen **grupos de captura**. Cada grupo extrae una porción específica del texto. Se numeran automáticamente de izquierda a derecha, empezando en `1`.

### Ejemplo visual paso a paso

Supongamos que tienes esta línea de log:

```
[2026-05-21 17:15:32] [INFO] [AuthService] - Usuario autenticado
```

La estructura es: `[FECHA] [NIVEL] [CLASE] - MENSAJE`

La regex para esta estructura sería:

```
^\[([^\]]+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s-\s(.*)$
```

Desglose pieza por pieza:

| Fragmento de Regex | Qué significa | Qué captura |
|---------------------|---------------|-------------|
| `^` | Inicio de la línea | _(nada)_ |
| `\[` | El carácter literal `[` | _(nada)_ |
| `([^\]]+)` | **Grupo 1**: Uno o más caracteres que NO sean `]` | `2026-05-21 17:15:32` |
| `\]` | El carácter literal `]` | _(nada)_ |
| `\s` | Un espacio en blanco | _(nada)_ |
| `\[` | El carácter literal `[` | _(nada)_ |
| `([^\]]+)` | **Grupo 2**: Uno o más caracteres que NO sean `]` | `INFO` |
| `\]` | El carácter literal `]` | _(nada)_ |
| `\s` | Un espacio en blanco | _(nada)_ |
| `\[` | El carácter literal `[` | _(nada)_ |
| `([^\]]+)` | **Grupo 3**: Uno o más caracteres que NO sean `]` | `AuthService` |
| `\]` | El carácter literal `]` | _(nada)_ |
| `\s-\s` | Espacio, guion, espacio (` - `) | _(nada)_ |
| `(.*)` | **Grupo 4**: Todo el resto de la línea | `Usuario autenticado` |
| `$` | Fin de la línea | _(nada)_ |

**Resultado**: La regex produce 4 grupos de captura:

```
Grupo 1 → "2026-05-21 17:15:32"   (Timestamp)
Grupo 2 → "INFO"                   (Nivel)
Grupo 3 → "AuthService"            (Clase)
Grupo 4 → "Usuario autenticado"    (Mensaje)
```

### Cheat Sheet de Regex para Logs

| Patrón | Significado | Uso Típico |
|--------|-------------|------------|
| `\d` | Un dígito (0-9) | Fechas, IDs |
| `\d+` | Uno o más dígitos | Números, puertos |
| `\d{4}` | Exactamente 4 dígitos | Año (`2026`) |
| `\s` | Un espacio en blanco | Separadores |
| `\s+` | Uno o más espacios | Separadores variables |
| `.` | Cualquier carácter | Comodín |
| `.*` | Cero o más de cualquier cosa | "Todo lo demás" |
| `.+` | Uno o más de cualquier cosa | "Algo de texto" |
| `[^\]]+` | Todo excepto `]` | Contenido entre corchetes |
| `[^,]+` | Todo excepto `,` | Campos CSV |
| `\[` y `\]` | Corchetes literales `[` y `]` | Delimitadores de campos |
| `(...)` | **Grupo de captura** | Lo que quieres extraer |
| `(?:...)` | Grupo sin captura | Agrupar sin extraer |
| `^` | Inicio de línea | Anclar la regex |
| `$` | Fin de línea | Anclar la regex |
| `\|` | Alternativa "OR" | `INFO\|DEBUG\|ERROR` |

---

## 7. Mapeo de Grupos de Captura

Una vez que tu regex tiene grupos `( )`, debes decirle a LogScope **qué grupo corresponde a qué columna**.

### Campos disponibles

| Campo | Índice a ingresar | ¿Obligatorio? | Descripción |
|-------|------|---------------|-------------|
| **Marca de Tiempo (Timestamp)** | El # del grupo que captura la fecha/hora | ⚠️ Recomendado | Sin esto, LogScope no puede ordenar cronológicamente ni calcular latencias |
| **Nivel de Severidad (Level)** | El # del grupo que captura INFO/ERROR/etc. | ⚠️ Recomendado | Sin esto, todos los logs aparecen como INFO y no se pueden filtrar por nivel |
| **Mensaje Principal (Message)** | El # del grupo que captura el cuerpo del log | ⚠️ Recomendado | El contenido principal que ves en la tabla |
| **Hilo de Ejecución (Thread)** | El # del grupo que captura el nombre del thread | Opcional | Útil para debugging de concurrencia |
| **Clase / Logger (ClassName)** | El # del grupo que captura la clase Java o módulo | Opcional | Se muestra en el drawer de detalles |
| **ID de Correlación** | El # del grupo que captura el ID de transacción | Opcional | Permite aislar flujos completos y generar diagramas UML |
| **Servicio o Endpoint** | El # del grupo que captura el nombre del servicio | Opcional | Se usa en los filtros de servicio |

### Ejemplo de mapeo

Si tu regex es: `^\[([^\]]+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s-\s(.*)$`

Y los grupos son:
- Grupo 1 = Fecha
- Grupo 2 = Nivel
- Grupo 3 = Clase
- Grupo 4 = Mensaje

Entonces el mapeo sería:

| Campo | Valor |
|-------|-------|
| Timestamp | `1` |
| Level | `2` |
| Message | `4` |
| ClassName | `3` |
| Thread | _(vacío)_ |
| CorrelationId | _(vacío)_ |
| Service | _(vacío)_ |

> [!TIP]
> Si un campo no existe en tu formato de log, simplemente déjalo **vacío**. No pongas `0` ni `-`.

---

## 8. Extracciones Secundarias (Regex sobre el Mensaje)

A veces, el ID de correlación o la clase no están en columnas separadas del log, sino **incrustados dentro del mensaje**. Para estos casos existen las extracciones secundarias.

### Campos disponibles

| Campo | Cuándo usarlo | Ejemplo |
|-------|---------------|---------|
| **Regex de ID de Correlación Secundario** | El ID de correlación está dentro del mensaje | Mensaje: `Procesando Peticion ID: TXN-123 para usuario X` → Regex: `Peticion\s*ID:\s*(\S+)` captura `TXN-123` |
| **Regex de Clase Secundaria** | La clase está dentro del mensaje | Mensaje: `[Class: com.empresa.Service] ejecutando` → Regex: `Class:\s*([^\s\]]+)` captura `com.empresa.Service` |
| **Regex de Servicio Secundario** | El endpoint está dentro del mensaje | Mensaje: `Endpoint: /api/pagos procesado` → Regex: `Endpoint:\s*(\S+)` captura `/api/pagos` |

### ¿Cómo funcionan?

1. LogScope primero aplica la **regex principal** y extrae todos los grupos primarios.
2. Si algún campo queda vacío (`-`), LogScope busca en el **mensaje extraído** usando la regex secundaria correspondiente.
3. El **Grupo 1** de la regex secundaria se usa como valor del campo.

> [!NOTE]
> Las extracciones secundarias solo se aplican si el campo primario correspondiente quedó vacío (`-`). Si la regex principal ya capturó el valor, la secundaria se ignora.

---

## 9. Probador de Regex en Vivo

En la parte inferior del editor hay una sección titulada **🐛 Probador de Expresión Regular en Vivo**.

### Cómo usarlo

1. **Pega una línea de log** real en el campo de texto
2. LogScope **compila tu regex en tiempo real** y la prueba contra la línea
3. Verás uno de dos resultados:

### Resultado exitoso ✓

Si la regex coincide, verás:

- Badge verde: **✓ COINCIDENCIA EXITOSA**
- Una tabla con todos los campos extraídos:
  - `Fecha/Hora` → el valor del timestamp
  - `Nivel` → el nivel con su pill de color (ej. badge amarillo para WARN)
  - `Hilo` → el nombre del thread
  - `Clase/Logger` → la clase (simplificada al nombre corto)
  - `Correlación ID` → el ID de transacción
  - `Servicio/API` → el endpoint
  - `Mensaje Parseado` → el cuerpo completo del mensaje

### Resultado fallido ✗

Si la regex no coincide, verás:

- Badge rojo: **✗ SIN COINCIDENCIA**
- Mensaje: "La línea no coincide con la Expresión Regular."

Esto significa que tu regex no encaja con la estructura de esa línea. Revisa:
- ¿Los separadores son correctos (espacios, corchetes, guiones)?
- ¿Hay caracteres especiales que necesitan escape (`\[`, `\]`, `\.`)?
- ¿La línea tiene una estructura diferente a la esperada?

### Regex inválida

Si escribiste una regex con errores de sintaxis (paréntesis sin cerrar, etc.):

- Badge rojo: **✗ SIN COINCIDENCIA**
- Mensaje: `Regex Inválida: [detalle del error]`

---

## 10. Ejercicio Práctico 1: Formato Spring Boot

### Línea de ejemplo

```
[2026-05-21 17:15:33.567] [http-nio-8080-exec-3] [WARN] [com.empresa.pagos.ValidadorSaldo] [COR:TXN-900002] - Saldo insuficiente: disponible=1200.00
```

### Paso 1: Identificar la estructura

```
[TIMESTAMP] [THREAD] [LEVEL] [CLASSNAME] [COR:CORRELATION_ID] - MESSAGE
```

Cada campo está entre corchetes `[ ]`, separados por espacios.

### Paso 2: Construir la Regex

```
^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s\[COR:([^\]]+)\]\s-\s(.*)$
```

| Grupo | Captura | Ejemplo |
|-------|---------|---------|
| 1 | Timestamp | `2026-05-21 17:15:33.567` |
| 2 | Thread | `http-nio-8080-exec-3` |
| 3 | Level | `WARN` |
| 4 | ClassName | `com.empresa.pagos.ValidadorSaldo` |
| 5 | CorrelationId | `TXN-900002` |
| 6 | Message | `Saldo insuficiente: disponible=1200.00` |

### Paso 3: Mapeo

| Campo | Índice |
|-------|--------|
| Timestamp | `1` |
| Level | `3` |
| Message | `6` |
| Thread | `2` |
| ClassName | `4` |
| CorrelationId | `5` |
| Service | _(vacío)_ |

### Paso 4: Extracciones secundarias

No se necesitan. Todos los campos se capturan directamente con la regex principal.

---

## 11. Ejercicio Práctico 2: Formato Apache Access Log

### Línea de ejemplo

```
192.168.1.100 - jperez [21/May/2026:17:15:32 -0500] "GET /api/productos HTTP/1.1" 200 4523
```

### Paso 1: Identificar la estructura

```
IP - USUARIO [TIMESTAMP] "MÉTODO RUTA PROTOCOLO" CÓDIGO_HTTP TAMAÑO
```

### Paso 2: Construir la Regex

```
^(\S+)\s-\s(\S+)\s\[([^\]]+)\]\s"(\S+)\s(\S+)\s[^"]+"\s(\d+)\s(\d+)$
```

| Grupo | Captura | Ejemplo |
|-------|---------|---------|
| 1 | IP del cliente | `192.168.1.100` |
| 2 | Usuario | `jperez` |
| 3 | Timestamp | `21/May/2026:17:15:32 -0500` |
| 4 | Método HTTP | `GET` |
| 5 | Ruta/Endpoint | `/api/productos` |
| 6 | Código HTTP | `200` |
| 7 | Tamaño respuesta | `4523` |

### Paso 3: Mapeo

| Campo | Índice | Notas |
|-------|--------|-------|
| Timestamp | `3` | |
| Level | `6` | Usamos el código HTTP como "nivel" (200=OK, 500=Error) |
| Message | `5` | La ruta como mensaje principal |
| Thread | _(vacío)_ | |
| ClassName | `1` | IP del cliente como "clase" |
| CorrelationId | `2` | Usuario como correlación |
| Service | `4` | Método HTTP como servicio |

> [!TIP]
> No todos los campos tienen un equivalente perfecto. Puedes ser creativo con el mapeo. Por ejemplo, usar el código HTTP como "nivel" te permite filtrar por `200`, `404`, `500`, etc. usando los pills de nivel.

---

## 12. Ejercicio Práctico 3: Formato CSV / Delimitado

### Línea de ejemplo

```
2026-05-21 17:15:32,INFO,PaymentService,TXN-12345,Pago procesado exitosamente por $1500.00
```

### Paso 1: Identificar la estructura

Campos separados por comas: `TIMESTAMP,LEVEL,SERVICE,CORRELATION_ID,MESSAGE`

### Paso 2: Construir la Regex

```
^([^,]+),([^,]+),([^,]+),([^,]+),(.*)$
```

| Grupo | Captura | Ejemplo |
|-------|---------|---------|
| 1 | Timestamp | `2026-05-21 17:15:32` |
| 2 | Level | `INFO` |
| 3 | Service | `PaymentService` |
| 4 | CorrelationId | `TXN-12345` |
| 5 | Message | `Pago procesado exitosamente por $1500.00` |

### Paso 3: Mapeo

| Campo | Índice |
|-------|--------|
| Timestamp | `1` |
| Level | `2` |
| Message | `5` |
| Thread | _(vacío)_ |
| ClassName | _(vacío)_ |
| CorrelationId | `4` |
| Service | `3` |

> [!NOTE]
> `[^,]+` significa "uno o más caracteres que NO sean coma". Es el patrón ideal para parsear formatos CSV.

---

## 13. Preguntas Frecuentes y Resolución de Problemas

### ❓ "Mi log no se parsea, todos aparecen como texto plano"

**Causa**: Ninguno de los parsers activos tiene una regex que coincida con el formato de tu log.

**Solución**:
1. Copia una línea del log
2. Abre el configurador de parsers
3. Crea un nuevo parser o selecciona uno existente
4. Pega la línea en el **Probador en Vivo**
5. Ajusta la regex hasta que veas ✓ COINCIDENCIA EXITOSA
6. Guarda y recarga el archivo

---

### ❓ "Solo algunas líneas se parsean, otras no"

**Causa**: Tu archivo de log tiene **múltiples formatos** mezclados (muy común en logs empresariales).

**Solución**: Crea un parser separado para cada formato. LogScope prueba todos los parsers en orden hasta encontrar uno que coincida.

---

### ❓ "El timestamp se extrae pero las fechas no se ordenan bien"

**Causa**: El formato de fecha no es reconocido por el motor de fechas de LogScope.

**Formatos de fecha soportados automáticamente**:
- `2026-05-21 17:15:32` ✅
- `2026-05-21 17:15:32.456` ✅
- `2026-05-21 17:15:32,456` ✅
- `21/05/2026 17:15:32` ✅
- `5/21/2026 5:15:32 PM` ✅
- `21-05-2026 17:15:32` ✅
- `May 21, 2026 17:15:32` ❌ (formato no soportado)

---

### ❓ "¿Puedo tener niveles personalizados como CRITICAL o AUDIT?"

**Sí.** LogScope detecta **automáticamente** cualquier nivel nuevo. Si tu regex extrae `CRITICAL`, `AUDIT`, `SECURITY`, `FATAL`, o cualquier texto como nivel, LogScope:

1. Lo agrega dinámicamente a la lista de niveles disponibles
2. Le asigna un color HSL único y armónico automáticamente
3. Lo muestra como una pill filtrable en la barra de niveles

No necesitas configurar nada extra.

---

### ❓ "¿Los parsers se guardan si cierro el navegador?"

**Sí.** Todos los parsers (de sistema y personalizados) se persisten automáticamente en el `localStorage` del navegador. Sobreviven cierres del navegador, recargas de página y sesiones futuras.

Si deseas compartirlos con otro equipo, usa la función **Exportar Sesión** que incluye los parsers en el archivo JSON.

---

### ❓ "Quiero borrar todo y empezar de cero"

Haz clic en **🔄 Restablecer Fábrica** en la parte inferior del panel izquierdo del modal. Esto elimina todos los parsers personalizados y restaura los 3 parsers de sistema originales.

---

### ❓ "¿Cuántos parsers puedo crear?"

No hay límite. Puedes crear tantos como necesites. Solo ten en cuenta que LogScope los prueba en orden secuencial, así que tener muchos parsers puede agregar un pequeño costo de procesamiento al cargar archivos grandes.

> [!TIP]
> **Desactiva** los parsers que no estés usando con el checkbox de cada tarjeta. Un parser desactivado no consume recursos de procesamiento.
