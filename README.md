# 🔍 LogScope - Analizador de Logs Premium para Capa Media

LogScope es una sofisticada herramienta web de análisis de logs diseñada específicamente para ingenieros de control de calidad (QA) y desarrolladores. Con una interfaz moderna, fluida y con estética *Glassmorphism* (diseñada sobre el tema One Dark Pro Darker), LogScope permite importar, parsear, filtrar y auditar archivos de log complejos de manera eficiente y visual.

---

## ✨ Características Avanzadas (QA-Centric)

LogScope va más allá de un visor de texto tradicional al incorporar herramientas inteligentes diseñadas para acelerar el diagnóstico de errores y cuellos de botella:

### 1. 🎯 Aislamiento de Flujo (Flow Isolation)
*   **Qué hace:** Permite aislar la vida de una única petición mediante su **ID de Correlación** con un solo clic.
*   **Utilidad:** Oculta el ruido de otros hilos y peticiones concurrentes para enfocarse únicamente en el flujo seleccionado.

### 2. ⚡ Analizador de Latencia entre Logs (Time Delta Analyzer)
*   **Qué hace:** Calcula automáticamente el tiempo transcurrido (en milisegundos) entre registros consecutivos del mismo flujo (mismo ID de correlación).
*   **Código de colores intuitivo:**
    *   🔴 **Rojo (`> 5000ms`)**: Cuello de botella crítico o potencial timeout.
    *   🟡 **Amarillo (`> 1000ms`)**: Latencia alta.
    *   ⚪ **Gris (`<= 1000ms`)**: Tiempo de respuesta normal.

### 3. 📌 Marcadores de Logs Persistentes (Pinned Logs / Bookmarks)
*   **Qué hace:** Permite fijar líneas de interés clave en un panel lateral dedicado para consultarlas rápidamente sin importar los filtros aplicados.
*   **Persistencia inteligente:** Los marcadores se guardan de manera persistente en `localStorage` **por nombre de archivo**, evitando colisiones entre distintos logs y restaurándose automáticamente al refrescar la página.

### 4. 📝 Exportador de Reportes de Bugs (Markdown Exporter)
*   **Qué hace:** Genera reportes estructurados de incidencias en formato Markdown listos para copiar y pegar en Jira, Slack, Teams o Azure DevOps.
*   **Incluye:** Tablas de metadatos (timestamp, nivel, servicio, ID de correlación) y bloques de código con el payload JSON o XML formateado.

### 5. 🔄 Comparador de Payloads Lado a Lado (XML/JSON Diff Viewer)
*   **Qué hace:** Permite seleccionar dos logs de la cola de comparación para confrontar sus payloads estructurados cara a cara en un modal de pantalla completa con scroll sincronizado.
*   **Visualización:** Resalta inserciones en verde y eliminaciones en rojo de forma ultra-precisa mediante un motor de diferenciación de texto.

---

## 🛠️ Stack Tecnológico

La aplicación está construida utilizando tecnologías frontend y backend modernas de alto rendimiento:

*   **Frontend Core:** React 18, TypeScript, Vite.
*   **Estilos:** CSS3 puro (Vanilla CSS) personalizado con soporte completo para Tema Oscuro y Tema Claro adaptativos.
*   **Iconografía:** Material Icons Round (Google Fonts).
*   **Servidor Backend:** Node.js, Express (para streaming síncrono de logs locales y mapeo automático del directorio).

---

## 📦 Estructura del Proyecto

```text
log-viewer/
├── public/                 # Assets públicos e index.html
├── src/
│   ├── application/        # Casos de uso (filtrado, generación de estadísticas)
│   ├── domain/             # Modelos de datos, formateadores y parser lógico
│   ├── infrastructure/     # API de comunicación con el backend de logs
│   ├── presentation/       # Sistema de tokens CSS, componentes y estilos
│   ├── App.tsx             # Componente raíz y lógica del visor de logs
│   └── main.tsx            # Punto de entrada de React
├── server.js               # Servidor backend en Express para lectura local
├── package.json            # Scripts de compilación y dependencias
└── tsconfig.json           # Configuración del compilador TypeScript
```

---

## 🚀 Instalación y Puesta en Marcha

Sigue estos sencillos pasos para iniciar LogScope en tu máquina local:

### 1. Requisitos Previos
Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior recomendado) y `npm`.

### 2. Instalar Dependencias
Instala los paquetes necesarios en el directorio del proyecto:
```bash
npm install
```

### 3. Ejecutar en Modo Desarrollo
Inicia el entorno de desarrollo local con recarga en vivo (HMR) y el servidor de logs integrado:

Para arrancar el frontend de desarrollo de Vite:
```bash
npm run dev
```

El servidor web de desarrollo estará disponible en: 👉 **[http://localhost:5173](http://localhost:5173)**

*Nota: Asegúrate de tener también en ejecución el servidor backend (`node server.js`) para poder listar y transmitir los logs ubicados en la carpeta del proyecto.*

### 4. Compilar para Producción
Si deseas construir la versión de distribución optimizada:
```bash
npm run build
```

Los archivos estáticos generados se ubicarán en la carpeta `public/` optimizada para ser servida por tu servidor web.

---

## 📖 Instrucciones de Uso

1.  **Carga de Logs:** Selecciona uno de los archivos detectados automáticamente en la barra lateral izquierda bajo la sección `"ARCHIVOS LOCALES"`, o arrastra un archivo `.log`/`.txt` externo directamente a la zona de arrastre.
2.  **Filtrado Rápido:** Haz clic en los botones de colores de la cabecera (INFO, ERROR, WARN, REQ, RESP) para activar o desactivar filtros de nivel específicos.
3.  **Aislamiento de Flujo:** Haz clic en el icono del embudo al lado de cualquier ID de Correlación para rastrear únicamente el ciclo de vida de esa petición.
4.  **Marcadores (Pines):** Haz clic en el icono del pin en cualquier fila o en el panel de detalles para guardarlo. Puedes hacer clic en cualquiera de los marcadores del menú lateral para desplazarte suavemente hasta la fila correspondiente.
5.  **Comparación:** Abre el detalle de dos logs distintos y haz clic en "Agregar a Comparar". Una vez que la cola inferior marque `2/2`, haz clic en "Comparar" para ver las diferencias estructuradas lado a lado.
