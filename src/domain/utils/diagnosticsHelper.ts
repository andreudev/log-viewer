import { LogEntry } from '../models/LogEntry';

export interface SmartDiagnostic {
  title: string;
  severity: 'danger' | 'warning' | 'info';
  description: string;
  recommendation: string;
}

export function getSmartDiagnostic(log: LogEntry): SmartDiagnostic | null {
  const msg = (log.message || '').toLowerCase();
  
  // 1. Connection Timeout / Socket Timeout
  if (msg.includes('sockettimeoutexception') || msg.includes('read timed out') || msg.includes('timeout waiting for connection')) {
    return {
      title: 'Límite de Tiempo Agotado (Socket Timeout / Read Timeout)',
      severity: 'danger',
      description: 'El cliente de integración de Capa Media no recibió respuesta del servidor externo/microservicio dentro del tiempo límite establecido.',
      recommendation: '1. Verificar la disponibilidad y salud del microservicio destino en el servidor de destino.\n2. Auditar la latencia de red y posibles reglas de cortafuegos (Firewalls) que estén bloqueando la trama.\n3. Si el tráfico es normal pero pesado, considerar incrementar el "Read Timeout" en la configuración del conector SOAP/REST.'
    };
  }

  // 2. Connection Refused
  if (msg.includes('connection refused') || msg.includes('connectexception') || msg.includes('unknownhostexception')) {
    return {
      title: 'Conexión Rechazada o Host No Encontrado',
      severity: 'danger',
      description: 'No se pudo establecer una conexión TCP física con el endpoint remoto. El puerto de destino está cerrado, el host no está escuchando o la dirección DNS es inválida.',
      recommendation: '1. Validar que la dirección IP/DNS del host remoto sea correcta.\n2. Asegurar que el servicio remoto esté arriba y escuchando en el puerto correspondiente.\n3. Comprobar conectividad directa mediante comandos como telnet o curl desde el servidor de Capa Media.'
    };
  }

  // 3. Database constraint / key violation
  if (msg.includes('unique index') || msg.includes('duplicate key') || msg.includes('constraint violation') || msg.includes('sp_cerror') || msg.includes('foreign key constraint')) {
    return {
      title: 'Violación de Restricción de Base de Datos',
      severity: 'danger',
      description: 'La base de datos (Sybase, SQL Server, u Oracle) rechazó la operación de inserción o actualización por colisión de llave única (registro duplicado) o llave foránea inexistente.',
      recommendation: '1. Revisar si el ID de transacción o registro ya existe en las tablas de destino.\n2. Inspeccionar la generación del correlativo/secuencia (Sequence/Identity) en la base de datos por posibles desalineaciones.\n3. Validar si la petición se envió dos veces debido a un reintento automático del Gateway.'
    };
  }

  // 4. Out of Memory Error
  if (msg.includes('outofmemoryerror') || msg.includes('java heap space') || msg.includes('gc overhead limit exceeded')) {
    return {
      title: 'Memoria Agotada en el Servidor (Out of Memory)',
      severity: 'danger',
      description: 'La máquina virtual del servidor Java de Capa Media se ha quedado sin memoria Heap disponible para procesar nuevos objetos.',
      recommendation: '1. Realizar un Heap Dump inmediato del servidor para auditar qué objetos o colecciones están causando la fuga de memoria (Memory Leak).\n2. Evaluar un incremento de los parámetros -Xms y -Xmx de memoria máxima asignada al contenedor Java.\n3. Auditar consultas masivas (Selects gigantescos) sin paginar que estén cargando demasiados datos en memoria simultáneamente.'
    };
  }

  // 5. Connection Pool Exhausted
  if (msg.includes('db connection pool') || msg.includes('connection is not available') || (msg.includes('connection timeout') && (msg.includes('datasource') || msg.includes('pool')))) {
    return {
      title: 'Pool de Conexiones a Base de Datos Agotado',
      severity: 'warning',
      description: 'El pool de conexiones de base de datos (e.g. HikariCP) está saturado. Todas las conexiones físicas están siendo utilizadas por transacciones activas y el hilo actual expiró esperando una conexión libre.',
      recommendation: '1. Auditar fugas de conexiones (hilos que no cierran sus conexiones o transacciones abiertas indefinidamente).\n2. Si el volumen es correcto pero alto, incrementar el tamaño máximo del pool (Max Pool Size).\n3. Analizar consultas lentas que retienen las conexiones físicas por demasiado tiempo.'
    };
  }

  // 6. SOAP Fault / env:Receiver / env:Sender
  if (msg.includes('soapenv:fault') || msg.includes('<soap:fault') || msg.includes('faultstring')) {
    const isClientFault = msg.includes('env:client') || msg.includes('env:sender') || msg.includes('soapenv:client');
    return {
      title: isClientFault ? 'Error de Cliente SOAP (Fault: Sender/Client)' : 'Error del Servidor SOAP (Fault: Receiver/Server)',
      severity: isClientFault ? 'warning' : 'danger',
      description: isClientFault 
        ? 'El servidor destino rechazó la petición SOAP debido a un mensaje mal estructurado, campos obligatorios vacíos o credenciales inválidas.'
        : 'El servidor externo SOAP aceptó la petición pero experimentó una falla interna crítica al procesar la lógica de negocio.',
      recommendation: isClientFault 
        ? '1. Validar el cuerpo XML contra el esquema WSDL oficial.\n2. Comprobar que todas las etiquetas obligatorias estén presentes y contengan datos con el tipo correcto.\n3. Auditar las credenciales o firmas WS-Security dentro del encabezado (SOAP Header).'
        : '1. Analizar el detalle de la falla dentro del elemento <faultstring> o <detail> del XML.\n2. Contactar al proveedor del servicio externo para auditar sus registros del servidor.'
    };
  }

  // Fallback for general errors
  if (log.level === 'ERROR') {
    return {
      title: 'Error General de Ejecución',
      severity: 'warning',
      description: 'Se ha registrado un evento con severidad de error en la traza de logs de la aplicación.',
      recommendation: '1. Inspeccionar el mensaje completo del log y la pila de traza (Stack Trace) si está disponible.\n2. Aislar la transacción mediante el ID de correlación para reconstruir el flujo de ejecución completo.'
    };
  }

  return null;
}
