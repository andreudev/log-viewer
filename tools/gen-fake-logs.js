#!/usr/bin/env node
/**
 * tools/gen-fake-logs.js
 *
 * Generador de logs sintéticos para pruebas locales de LogScope v5.0.
 * Produce 4 archivos en ../fake-logs/ (carpeta hermana del proyecto) usando
 * los 4 formatos que reconoce el parser por defecto (format-a/b/c/d) y
 * patrones que disparan los diagnósticos de runDiagnosis.
 *
 * Uso:
 *   node tools/gen-fake-logs.js              # genera todo (3 corridas completas)
 *   node tools/gen-fake-logs.js --count=1    # genera 1 corrida (4 archivos)
 *   node tools/gen-fake-logs.js --out=./mis-logs   # directorio personalizado
 *
 * No produce archivos secretos, no escribe en el repo, no toca git.
 */

const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Configuración
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argMap = {};
for (const a of args) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) argMap[m[1]] = m[2] ?? true;
}

const COUNT = parseInt(argMap.count || '3', 10);
const OUT = path.resolve(
  argMap.out || path.join(__dirname, '..', '..', 'fake-logs')
);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

/**
 * Devuelve un timestamp Formato A: "2026-08-03 14:25:08,501"
 */
function tsFormatA(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())},` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}

/**
 * Devuelve un timestamp Formato B: "8/3/2026 2:25:08 PM"
 */
function tsFormatB(date) {
  let h = date.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${h}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`;
}

/**
 * Devuelve un timestamp Formato C: "[08-03-2026 14:25:08]"
 */
function tsFormatC(date) {
  return `[${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}]`;
}

/**
 * Devuelve un timestamp Formato D: "2026-08-03 14:25:08.501"
 */
function tsFormatD(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function correlationId() {
  return `CORR-${uuid().slice(0, 8).toUpperCase()}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Generadores por formato
// ──────────────────────────────────────────────────────────────────────────────

const CLASSES = [
  'com.capa.media.gateway.GatewayService',
  'com.capa.media.adapter.BancoAdapter',
  'com.capa.media.soap.SOAPRouter',
  'com.capa.media.audit.AuditLogger',
  'com.capa.media.security.AuthFilter',
  'com.capa.media.db.ConnectionPool'
];

const THREADS = [
  'http-nio-8080-exec-1', 'http-nio-8080-exec-2', 'pool-1-thread-3',
  'kafka-consumer-1', 'scheduler-1', 'reactor-http-nio-2'
];

const ENDPOINTS = ['1015', '2030', '3410', '4525', '5670'];

/**
 * FORMAT A — Java/Logback estándar:
 *   2026-08-03 14:25:08,501  INFO  com.foo.Bar  [thread-1]  Mensaje...
 */
function genFormatA(baseTime, lines = 40) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const t = new Date(baseTime.getTime() + i * 1200 + Math.random() * 400);
    const level = rand(['INFO', 'INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR']);
    const cls = rand(CLASSES);
    const th = rand(THREADS);
    const corr = correlationId();
    const ep = rand(ENDPOINTS);

    // Variedad: algunos logs disparan runDiagnosis
    let msg;
    if (level === 'ERROR' && Math.random() < 0.3) {
      msg = `[ Class: ${cls} ] [ Peticion ID: ${corr} ] [ Endpoint: ${ep} ] Attempt to insert duplicate key row in object 'dbo.CLIENTES' unique index 'PK_CLIENTES_ID'`;
    } else if (level === 'WARN' && Math.random() < 0.25) {
      msg = `[ Class: ${cls} ] [ Peticion ID: ${corr} ] [ Endpoint: ${ep} ] La cuenta no esta vigente en el core`;
    } else if (level === 'ERROR' && Math.random() < 0.2) {
      msg = `[ Class: ${cls} ] [ Peticion ID: ${corr} ] SocketTimeoutException: Read timed out after 30000ms`;
    } else {
      msg = `[ Class: ${cls} ] [ Peticion ID: ${corr} ] [ Endpoint: ${ep} ] Procesando transaccion tipo ${rand(['consulta', 'transferencia', 'pago', 'bloqueo'])} OK`;
    }
    out.push(`${tsFormatA(t)}  ${level}  ${cls}  [${th}]  ${msg}`);
  }
  return out.join('\n');
}

/**
 * FORMAT B — Capa Media Entrada/Salida:
 *   8/3/2026 2:25:08 PM - CORR-XXXXXXXX - METODO: getSaldo - INPUT: payload...
 */
function genFormatB(baseTime, lines = 30) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const t = new Date(baseTime.getTime() + i * 800);
    const corr = correlationId();
    const method = rand(['getSaldo', 'setTransfer', 'bloquearCuenta', 'consultarCliente', 'procesarPago']);
    const side = rand(['INPUT', 'OUTPUT']);
    const payload = side === 'INPUT'
      ? `<soap:Envelope><soap:Body><Req><id>${rand([1001, 1002, 1003])}</id></Req></soap:Body></soap:Envelope>`
      : `<soap:Envelope><soap:Body><Resp><status>OK</status><saldo>${(Math.random() * 10000).toFixed(2)}</saldo></Resp></soap:Body></soap:Envelope>`;
    out.push(`${tsFormatB(t)} - ${corr} - METODO: ${method} - ${side}: ${payload}`);
  }
  return out.join('\n');
}

/**
 * FORMAT C — Tráfico SOAP/SSN:
 *   [08-03-2026 14:25:08 REQ -ssn:ABC123-1234]: <xml...>
 */
function genFormatC(baseTime, lines = 25) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const t = new Date(baseTime.getTime() + i * 1500);
    const side = rand(['REQ', 'RESP']);
    const ssn = `SSN-${uuid().slice(0, 12).toUpperCase()}`;
    let body;
    if (side === 'REQ') {
      body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><Req op="${rand(['read', 'write', 'delete'])}"><id>${rand([5001, 5002])}</id></Req></soapenv:Body></soapenv:Envelope>`;
    } else {
      body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><Resp code="200">OK</Resp></soapenv:Body></soapenv:Envelope>`;
    }
    out.push(`${tsFormatC(t)} ${side} -ssn:${ssn}-: ${body}`);
  }
  return out.join('\n');
}

/**
 * FORMAT D — Java Custom / Live Test:
 *   2026-08-03 14:25:08.501 [INFO] [com.capa.X] [CORR-XXXXXXXX] Mensaje...
 */
function genFormatD(baseTime, lines = 35) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const t = new Date(baseTime.getTime() + i * 600 + Math.random() * 200);
    const level = rand(['DEBUG', 'INFO', 'INFO', 'INFO', 'WARN']);
    const cls = rand(CLASSES);
    const corr = correlationId();
    const msg = rand([
      'Iniciando transaccion',
      'Validando firma',
      'Cache hit',
      'Cache miss',
      'Llamada a backend externo',
      'Respuesta recibida',
      'Cerrando conexion'
    ]);
    out.push(`${tsFormatD(t)} [${level}] [${cls}] [${corr}] ${msg}`);
  }
  return out.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filepath, content) {
  fs.writeFileSync(filepath, content + '\n', 'utf8');
}

function main() {
  ensureDir(OUT);

  const now = new Date();
  // Cada "corrida" genera 4 archivos (uno por formato). Los timestamps se
  // escalonan en el pasado para que el backend los liste ordenados por mtime.
  let generated = 0;

  for (let run = 0; run < COUNT; run++) {
    const base = new Date(now.getTime() - run * 60 * 60 * 1000); // 1h de offset por corrida
    const tag = pad(run + 1);

    writeFile(path.join(OUT, `app-format-a-${tag}.log`), genFormatA(base));
    writeFile(path.join(OUT, `capamedia-format-b-${tag}.log`), genFormatB(base));
    writeFile(path.join(OUT, `soap-format-c-${tag}.log`), genFormatC(base));
    writeFile(path.join(OUT, `livetest-format-d-${tag}.log`), genFormatD(base));
    generated += 4;
  }

  // Genera también un archivo "ruidoso" con líneas que NO matchean ningún
  // parser, para validar que la app no truena ante líneas basura.
  const noisy = [];
  for (let i = 0; i < 20; i++) {
    noisy.push(`Línea basura ${i + 1} que no debería parsear correctamente`);
    noisy.push(`[INFO] algo sin timestamp al inicio`);
    noisy.push(``);
  }
  writeFile(path.join(OUT, `noisy-mixed.log`), noisy.join('\n'));

  console.log(`✔ ${generated + 1} archivos generados en: ${OUT}`);
  console.log(`  - ${COUNT} corridas x 4 formatos (a/b/c/d)`);
  console.log(`  - 1 archivo ruidoso de prueba`);
  console.log(``);
  console.log(`Próximos pasos:`);
  console.log(`  1. Abre la UI: http://localhost:5173`);
  console.log(`  2. Settings → Local logs dir → apunta a: ${OUT}`);
  console.log(`  3. Verifica que los .log aparecen en la Sidebar`);
  console.log(`  4. Click en cualquiera para parsear y validar`);
}

main();
