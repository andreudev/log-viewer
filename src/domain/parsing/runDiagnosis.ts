export function runDiagnosis(msg: string): string | null {
  const txt = msg.toLowerCase();
  if (txt.includes("attempt to insert duplicate key row in object") && txt.includes("unique index")) {
    const tableMatch = msg.match(/object\s+'([^']+)'/i);
    const indexMatch = msg.match(/unique index\s+'([^']+)'/i);
    const tbl = tableMatch ? tableMatch[1] : 'desconocida';
    const idx = indexMatch ? indexMatch[1] : 'desconocido';
    return `<b>Error de Clave Duplicada (SQL Server / Sybase).</b><br>
            Se intentó insertar un registro duplicado en <code>${tbl}</code> bajo el índice <code>${idx}</code>.<br>
            <i>Acción correctiva:</i> Verificar que la petición no se haya enviado dos veces.`;
  }
  if (txt.includes("cuenta no esta vigente") || txt.includes("cuenta no está vigente")) {
    return `<b>Cuenta Inactiva / No Vigente.</b><br>
            La cuenta está bloqueada o inactiva en el core bancario.<br>
            <i>Acción correctiva:</i> Revisar estado de la cuenta.`;
  }
  if (txt.includes("timeout") || txt.includes("sockettimeoutexception")) {
    return `<b>Timeout de Conexión.</b><br>
            La conexión con el WS/API externa tardó más de lo permitido.<br>
            <i>Acción correctiva:</i> Comprobar conectividad con el servicio.`;
  }
  if (txt.includes("nullpointerexception")) {
    return `<b>NullPointerException.</b><br>
            Se intentó acceder a un objeto nulo en el servidor Java.<br>
            <i>Acción correctiva:</i> Reportar al equipo de desarrollo con la traza completa.`;
  }
  return null;
}
