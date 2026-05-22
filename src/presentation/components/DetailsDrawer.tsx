import React, { useCallback } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { formatPayload } from '../../domain/formatting/formatPayload';
import { highlightJson } from '../../domain/formatting/highlightJson';
import { highlightXml } from '../../domain/formatting/highlightXml';
import { highlightHtmlText } from '../../domain/formatting/highlightHtmlText';
import { escapeHtml } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';

interface DetailsDrawerProps {
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeLog: LogEntry | null;
  pinnedKeys: Set<string>;
  togglePin: (log: LogEntry) => void;
  compareQueue: LogEntry[];
  setCompareQueue: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  exportSuccess: boolean;
  setExportSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  activeDiagnosis: string | null;
  copyText: (text: string) => Promise<void>;
  searchTerm: string;
  isRegexSearch: boolean;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

import { useState, useEffect, useRef } from 'react';

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
  isDrawerOpen,
  setIsDrawerOpen,
  activeLog,
  pinnedKeys,
  togglePin,
  compareQueue,
  setCompareQueue,
  exportSuccess,
  setExportSuccess,
  activeDiagnosis,
  copyText,
  searchTerm,
  isRegexSearch,
  setFilters,
  setCurrentPage
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [localCopySuccess, setLocalCopySuccess] = useState<'formatted' | 'minified' | null>(null);

  // States for XPath / JSONPath Console
  const [queryPath, setQueryPath] = useState('');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Reiniciar búsqueda local y consulta al cambiar de log
  useEffect(() => {
    setLocalSearchQuery('');
    setActiveMatchIndex(0);
    setLocalCopySuccess(null);
    setQueryPath('');
    setQueryResult(null);
    setQueryError(null);
  }, [activeLog]);

  // Resolutor JSONPath Recursivo Nativo
  const evaluateJsonPath = useCallback((obj: any, path: string): any => {
    if (!path || path === '$') return obj;
    let cleanPath = path.startsWith('$.') ? path.slice(2) : (path.startsWith('$') ? path.slice(1) : path);
    if (!cleanPath) return obj;
    
    const parts = cleanPath.split(/\.(?![^\[]*\])/);
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      
      const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const idx = parseInt(arrayMatch[2], 10);
        current = current[key];
        if (Array.isArray(current)) {
          current = current[idx];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }
    return current;
  }, []);

  // Resolutor XPath Nativo
  const evaluateXPath = useCallback((xmlStr: string, xpathExpr: string): string[] => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlStr, "application/xml");
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        return ["XML inválido o con errores de parseo."];
      }
      
      const resolver = (prefix: string) => {
        const nsMap: Record<string, string> = {
          'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
          'soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
          'xsd': 'http://www.w3.org/2001/XMLSchema',
          'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        };
        return nsMap[prefix] || doc.documentElement.namespaceURI || null;
      };
      
      const iterator = doc.evaluate(xpathExpr, doc, resolver, XPathResult.ANY_TYPE, null);
      const results: string[] = [];
      
      if (iterator.resultType === XPathResult.NUMBER_TYPE) {
        return [String(iterator.numberValue)];
      } else if (iterator.resultType === XPathResult.STRING_TYPE) {
        return [iterator.stringValue];
      } else if (iterator.resultType === XPathResult.BOOLEAN_TYPE) {
        return [String(iterator.booleanValue)];
      }
      
      let node = iterator.iterateNext();
      while (node) {
        results.push(node.textContent || node.nodeValue || '');
        node = iterator.iterateNext();
      }
      return results.length > 0 ? results : ["No se encontraron coincidencias para la expresión."];
    } catch (e: any) {
      return [`Error en XPath: ${e.message}`];
    }
  }, []);

  // XPath & JSONPath evaluation logic
  useEffect(() => {
    if (!queryPath || !activeLog) {
      setQueryResult(null);
      setQueryError(null);
      return;
    }
    
    const payload = formatPayload(activeLog.message);
    if (payload.kind === 'none' || !payload.formatted) {
      setQueryResult(null);
      setQueryError(null);
      return;
    }
    
    try {
      if (payload.kind === 'json') {
        let obj;
        try {
          obj = JSON.parse(payload.formatted);
        } catch {
          const rawPayloadStr = payload.formatted.trim();
          obj = new Function(`return ${rawPayloadStr}`)();
        }
        
        const res = evaluateJsonPath(obj, queryPath);
        if (res === undefined) {
          setQueryError("No se encontraron coincidencias para la ruta especificada.");
          setQueryResult(null);
        } else {
          setQueryResult(JSON.stringify(res, null, 2));
          setQueryError(null);
        }
      } else if (payload.kind === 'xml') {
        const resList = evaluateXPath(payload.formatted, queryPath);
        if (resList.length === 1 && resList[0].startsWith('Error en XPath:')) {
          setQueryError(resList[0]);
          setQueryResult(null);
        } else {
          setQueryResult(resList.join('\n'));
          setQueryError(null);
        }
      }
    } catch (e: any) {
      setQueryError(`Error en consulta: ${e.message}`);
      setQueryResult(null);
    }
  }, [queryPath, activeLog, evaluateJsonPath, evaluateXPath]);

  // QA Replicator Direct Downloads
  const triggerDownload = useCallback((content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const exportPostmanCollection = useCallback((log: LogEntry, payloadText: string, isXml: boolean) => {
    const serviceName = log.service !== '-' ? log.service : `Log #${log.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = log.service.startsWith('/') ? log.service : `/services/${log.service}`;
    const urlRaw = `http://localhost:8080${path}`;

    // Generación Automática de Aserciones de Depuración (Postman)
    const assertions = [
      `// Aserciones automáticas generadas por LogScope v5.0`,
      `pm.test("Código de estado HTTP es 200 o 201", function () {`,
      `    pm.expect(pm.response.code).to.be.oneOf([200, 201]);`,
      `});`,
      ``,
      `pm.test("El tiempo de respuesta es óptimo (< 2000ms)", function () {`,
      `    pm.expect(pm.response.responseTime).to.be.below(2000);`,
      `});`,
      ``,
      `pm.test("Cabecera de Correlación presente", function () {`,
      `    pm.response.to.have.header("X-Correlation-ID");`,
      `});`
    ];

    if (!isXml) {
      assertions.push(
        ``,
        `pm.test("La respuesta es un JSON válido", function () {`,
        `    pm.response.to.be.json;`,
        `});`
      );
      try {
        let obj;
        try {
          obj = JSON.parse(payloadText);
        } catch {
          const rawPayloadStr = payloadText.trim();
          obj = new Function(`return ${rawPayloadStr}`)();
        }

        if (obj && typeof obj === 'object') {
          const keys = Object.keys(obj).slice(0, 5); // Hasta 5 llaves principales
          keys.forEach(key => {
            const val = obj[key];
            const typeOfVal = typeof val;
            assertions.push(
              ``,
              `pm.test("Response contiene el campo '${key}'", function () {`,
              `    var jsonData = pm.response.json();`,
              `    pm.expect(jsonData).to.have.property('${key}');`,
              `    pm.expect(typeof jsonData.${key}).to.eql("${typeOfVal}");`,
              `});`
            );
          });
        }
      } catch (e) {
        // Fallback silencioso
      }
    } else {
      assertions.push(
        ``,
        `pm.test("La respuesta es un XML válido", function () {`,
        `    var jsonObject = xml2Json(responseBody);`,
        `    pm.expect(jsonObject).to.not.be.undefined;`,
        `});`
      );
      try {
        // Extraer algunas etiquetas XML
        const tagRegex = /<([a-zA-Z0-9_\-:]+)(?:\s|>)/g;
        const foundTags = new Set<string>();
        let match;
        while ((match = tagRegex.exec(payloadText)) !== null && foundTags.size < 4) {
          const tag = match[1];
          if (!tag.startsWith('/') && !tag.toLowerCase().startsWith('?xml') && !tag.toLowerCase().includes('envelope') && !tag.toLowerCase().includes('body')) {
            foundTags.add(tag);
          }
        }
        if (foundTags.size > 0) {
          assertions.push(
            ``,
            `pm.test("La estructura XML contiene nodos esperados", function () {`,
            `    var responseText = pm.response.text();`
          );
          foundTags.forEach(tag => {
            assertions.push(`    pm.expect(responseText).to.include("<${tag}");`);
          });
          assertions.push(`});`);
        }
      } catch (e) {
        // Fallback silencioso
      }
    }
    
    const postman = {
      info: {
        _postman_id: `logscope-${log.id}-${Date.now()}`,
        name: `LogScope Replicator - ${serviceName}`,
        description: `Colección generada automáticamente a partir del log #${log.id} del servicio ${serviceName}.`,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: [
        {
          name: serviceName,
          event: [
            {
              listen: "test",
              script: {
                exec: assertions,
                type: "text/javascript"
              }
            }
          ],
          request: {
            method: "POST",
            header: [
              {
                key: "Content-Type",
                value: contentType
              },
              {
                key: "X-Correlation-ID",
                value: log.correlationId
              },
              {
                key: "X-LogScope-Origin",
                value: `LogEntry-${log.id}`
              }
            ],
            body: {
              mode: "raw",
              raw: payloadText
            },
            url: {
              raw: urlRaw,
              protocol: "http",
              host: ["localhost"],
              port: "8080",
              path: path.split('/').filter(Boolean)
            }
          }
        }
      ]
    };
    
    triggerDownload(
      JSON.stringify(postman, null, 2),
      `postman_collection_${cleanServiceName}_log_${log.id}.json`,
      'application/json'
    );
  }, [triggerDownload]);

  const exportJMeterScenario = useCallback((log: LogEntry, payloadText: string, isXml: boolean) => {
    const serviceName = log.service !== '-' ? log.service : `Log #${log.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = log.service.startsWith('/') ? log.service : `/services/${log.service}`;
    
    const pools = payloadText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
      
    const jmx = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Plan de Pruebas LogScope" enabled="true">
      <stringProp name="TestPlan.comments">Generado por LogScope v5.0</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="Variables Definidas por el Usuario" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Grupo de Hilos QA" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Controlador Bucle" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">1</stringProp>
        <stringProp name="ThreadGroup.ramp_time">1</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
        <stringProp name="ThreadGroup.duration"></stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="HTTP Request - ${serviceName}" enabled="true">
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${pools}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">8080</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path">${path}</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Gestor de Cabeceras HTTP" enabled="true">
            <collectionProp name="HeaderManager.headers">
              <elementProp name="" elementType="Header">
                <stringProp name="Header.name">Content-Type</stringProp>
                <stringProp name="Header.value">${contentType}</stringProp>
              </elementProp>
              <elementProp name="" elementType="Header">
                <stringProp name="Header.name">X-Correlation-ID</stringProp>
                <stringProp name="Header.value">${log.correlationId}</stringProp>
              </elementProp>
              <elementProp name="" elementType="Header">
                <stringProp name="Header.name">X-LogScope-Origin</stringProp>
                <stringProp name="Header.value">LogEntry-${log.id}</stringProp>
              </elementProp>
            </collectionProp>
          </HeaderManager>
          <hashTree/>
        </hashTree>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;

    triggerDownload(
      jmx,
      `jmeter_scenario_${cleanServiceName}_log_${log.id}.jmx`,
      'application/xml'
    );
  }, [triggerDownload]);

  const exportWireMockStub = useCallback((log: LogEntry, payloadText: string, isXml: boolean) => {
    const serviceName = log.service !== '-' ? log.service : `Log #${log.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = log.service.startsWith('/') ? log.service : `/services/${log.service}`;
    
    const stub = {
      request: {
        method: "POST",
        urlPattern: path,
        bodyPatterns: [
          {
            matches: ".*"
          }
        ]
      },
      response: {
        status: 200,
        body: payloadText,
        headers: {
          "Content-Type": contentType,
          "X-Correlation-ID": log.correlationId
        }
      }
    };
    
    triggerDownload(
      JSON.stringify(stub, null, 2),
      `wiremock_stub_${cleanServiceName}_log_${log.id}.json`,
      'application/json'
    );
  }, [triggerDownload]);

  const exportSoapUIProject = useCallback((log: LogEntry, payloadText: string, isXml: boolean) => {
    const serviceName = log.service !== '-' ? log.service : `Log #${log.id}`;
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = log.service.startsWith('/') ? log.service : `/services/${log.service}`;
    
    const genUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    const projectUuid = genUuid();
    const interfaceUuid = genUuid();
    const operationUuid = genUuid();
    const resourceUuid = genUuid();
    const methodUuid = genUuid();
    const callUuid = genUuid();

    // Generar aserciones automáticas de SoapUI
    let soapAssertions = '';
    let restAssertions = '';

    if (isXml) {
      const assertionsList = [
        `<con:assertion xsi:type="con:SOAPResponseAssertion" id="${genUuid()}" name="SOAP Response"/>`,
        `<con:assertion xsi:type="con:SchemaComplianceAssertion" id="${genUuid()}" name="Schema Compliance">
          <con:configuration/>
        </con:assertion>`,
        `<con:assertion xsi:type="con:SimpleNotContainsAssertion" id="${genUuid()}" name="Not Contains SOAP Fault">
          <con:configuration>
            <token>soap:Fault</token>
          </con:configuration>
        </con:assertion>`
      ];

      try {
        // Encontrar tags con valores literales simples (no vacíos y sin hijos) usando Regex
        const elementRegex = /<([a-zA-Z0-9_\-:]+)>([^<>\s]+)<\/\1>/g;
        let match;
        const foundPaths = new Set<string>();
        while ((match = elementRegex.exec(payloadText)) !== null && foundPaths.size < 3) {
          const tag = match[1];
          const val = match[2];
          if (!tag.toLowerCase().includes('envelope') && !tag.toLowerCase().includes('body') && !tag.toLowerCase().includes('fault')) {
            const cleanTag = tag.includes(':') ? tag.split(':')[1] : tag;
            if (!foundPaths.has(cleanTag)) {
              foundPaths.add(cleanTag);
              assertionsList.push(`<con:assertion xsi:type="con:XPathContainsAssertion" id="${genUuid()}" name="XPath Match: ${cleanTag}">
          <con:configuration>
            <path>//*:${cleanTag}/text()</path>
            <content>${val}</content>
            <allowWildcards>false</allowWildcards>
            <ignoreNamspaceDifferences>true</ignoreNamspaceDifferences>
            <ignoreComments>false</ignoreComments>
          </con:configuration>
        </con:assertion>`);
            }
          }
        }
      } catch (e) {
        // Ignorar
      }

      soapAssertions = '\n        ' + assertionsList.join('\n        ');
    } else {
      const assertionsList = [
        `<con:assertion xsi:type="con:ValidStatusCodesAssertion" id="${genUuid()}" name="Valid HTTP Status Codes">
          <con:configuration>
            <codes>200,201</codes>
          </con:configuration>
        </con:assertion>`
      ];

      try {
        let obj;
        try {
          obj = JSON.parse(payloadText);
        } catch {
          const raw = payloadText.trim();
          obj = new Function(`return ${raw}`)();
        }

        if (obj && typeof obj === 'object') {
          const keys = Object.keys(obj).slice(0, 3);
          keys.forEach(key => {
            const val = obj[key];
            if (val !== null && typeof val !== 'object') {
              assertionsList.push(`<con:assertion xsi:type="con:JsonPathMatchAssertion" id="${genUuid()}" name="JsonPath Match: ${key}">
          <con:configuration>
            <path>$.${key}</path>
            <content>${String(val)}</content>
            <allowWildcards>false</allowWildcards>
            <ignoreNamspaceDifferences>false</ignoreNamspaceDifferences>
            <ignoreComments>false</ignoreComments>
          </con:configuration>
        </con:assertion>`);
            }
          });
        }
      } catch (e) {
        // Ignorar
      }

      restAssertions = '\n          ' + assertionsList.join('\n          ');
    }

    let xmlContent = '';

    if (isXml) {
      xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project id="${projectUuid}" activeEnvironment="Default" name="LogScope SOAP - ${cleanServiceName}" soapui-version="5.6.0" xmlns:con="http://eviware.com/soapui/config">
  <con:settings/>
  <con:interface xsi:type="con:WsdlInterface" id="${interfaceUuid}" wsaVersion="NONE" name="${cleanServiceName}SoapBinding" type="wsdl" bindingName="{http://logscope.capamedia/soap}${cleanServiceName}SoapBinding" soapVersion="1_1" anonymous="optional" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:settings/>
    <con:definitionCache/>
    <con:endpoints>
      <con:endpoint>http://localhost:8080${path}</con:endpoint>
    </con:endpoints>
    <con:operation id="${operationUuid}" isOneWay="false" action="" name="${cleanServiceName}" bindingOperationName="${cleanServiceName}" type="Request-Response" inputName="" receivesAttachments="false" sendsAttachments="false">
      <con:settings/>
      <con:call id="${callUuid}" name="Petición Log #${log.id}">
        <con:settings>
          <con:setting id="com.eviware.soapui.impl.wsdl.WsdlRequest@request-headers">&lt;xml-fragment xmlns:con="http://eviware.com/soapui/config"&gt;&lt;con:entry key="X-Correlation-ID" value="${log.correlationId}"/&gt;&lt;con:entry key="X-LogScope-Origin" value="LogEntry-${log.id}"/&gt;&lt;/xml-fragment&gt;</con:setting>
        </con:settings>
        <con:encoding>UTF-8</con:encoding>
        <con:endpoint>http://localhost:8080${path}</con:endpoint>
        <con:request><![CDATA[${payloadText}]]></con:request>
        <con:credentials>
          <con:selectedAuthProfile>No Authorization</con:selectedAuthProfile>
          <con:authType>No Authorization</con:authType>
        </con:credentials>
        <con:jmsConfig JMSDeliveryMode="PERSISTENT"/>
        <con:wsaConfig mustUnderstand="NONE" version="NONE"/>${soapAssertions}
      </con:call>
    </con:operation>
  </con:interface>
  <con:properties/>
  <con:wssContainer/>
</con:soapui-project>`;
    } else {
      xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project id="${projectUuid}" activeEnvironment="Default" name="LogScope REST - ${cleanServiceName}" soapui-version="5.6.0" xmlns:con="http://eviware.com/soapui/config">
  <con:settings/>
  <con:interface xsi:type="con:RestService" id="${interfaceUuid}" wadlVersion="http://wadl.dev.java.net/2009/02" name="REST Service - ${cleanServiceName}" type="rest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:settings/>
    <con:definitionCache/>
    <con:endpoints>
      <con:endpoint>http://localhost:8080</con:endpoint>
    </con:endpoints>
    <con:resource name="${cleanServiceName}" path="${path}" id="${resourceUuid}">
      <con:settings/>
      <con:method name="POST" id="${methodUuid}" method="POST">
        <con:settings/>
        <con:parameters/>
        <con:request name="Petición Log #${log.id}" id="${callUuid}" mediaType="application/json" postQueryString="false">
          <con:settings>
            <con:setting id="com.eviware.soapui.impl.support.AbstractHttpRequest@request-headers">&lt;xml-fragment xmlns:con="http://eviware.com/soapui/config"&gt;&lt;con:entry key="X-Correlation-ID" value="${log.correlationId}"/&gt;&lt;con:entry key="X-LogScope-Origin" value="LogEntry-${log.id}"/&gt;&lt;/xml-fragment&gt;</con:setting>
          </con:settings>
          <con:endpoint>http://localhost:8080</con:endpoint>
          <con:request><![CDATA[${payloadText}]]></con:request>
          <con:credentials>
            <con:selectedAuthProfile>No Authorization</con:selectedAuthProfile>
            <con:authType>No Authorization</con:authType>
          </con:credentials>
          <con:jmsConfig JMSDeliveryMode="PERSISTENT"/>
          <con:parameters/>${restAssertions}
        </con:request>
      </con:method>
    </con:resource>
  </con:interface>
  <con:properties/>
  <con:wssContainer/>
</con:soapui-project>`;
    }

    triggerDownload(
      xmlContent,
      `soapui_project_${cleanServiceName}_log_${log.id}.xml`,
      'application/xml'
    );
  }, [triggerDownload]);

  // Scroll automático y suave a la coincidencia activa en el payload
  useEffect(() => {
    if (localSearchQuery && isDrawerOpen) {
      const timer = setTimeout(() => {
        const activeElem = document.querySelector('.formatted-box .highlight-active');
        if (activeElem) {
          activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeMatchIndex, localSearchQuery, isDrawerOpen, activeLog]);

  const copyMinifiedPayload = useCallback((formattedText: string, kind: 'json' | 'xml') => {
    try {
      let minified = '';
      if (kind === 'json') {
        minified = JSON.stringify(JSON.parse(formattedText));
      } else {
        minified = formattedText.replace(/>\s+</g, '><').replace(/\r?\n|\r/g, '').trim();
      }
      copyText(minified);
      setLocalCopySuccess('minified');
      setTimeout(() => setLocalCopySuccess(null), 2000);
    } catch (e) {
      const fallback = formattedText.replace(/\s+/g, ' ').trim();
      copyText(fallback);
      setLocalCopySuccess('minified');
      setTimeout(() => setLocalCopySuccess(null), 2000);
    }
  }, [copyText]);

  const handleExportMarkdown = useCallback((log: LogEntry) => {
    const payloadInfo = formatPayload(log.message);
    const codeBlock = payloadInfo.formatted 
      ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` 
      : `\`\`\`text\n${log.message}\n\`\`\``;
    
    const report = `### 🚨 Reporte de Incidencia - LogScope
- **Registro ID:** #${log.id}
- **Nivel:** ${log.level}
- **Servicio/Método:** \`${log.service}\`
- **ID Correlación:** \`${log.correlationId}\`
- **Clase Origen:** \`${log.className}\`
- **Marca de Tiempo:** ${log.timestamp}
- **Hilo:** \`${log.thread}\`

#### 📝 Detalle / Payload:
${codeBlock}

---
*Reporte generado automáticamente desde LogScope Analyzer*`;

    copyText(report);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  }, [copyText, setExportSuccess]);

  const handleIsolateFlow = useCallback((cid: string) => {
    setFilters((p: any) => ({ ...p, correlationId: cid }));
    setCurrentPage(1);
  }, [setFilters, setCurrentPage]);

  if (!isDrawerOpen || !activeLog) return null;

  const isPinned = pinnedKeys.has(`${activeLog.originFile || 'upload'}::${activeLog.originalId || activeLog.id}`);
  const isInCompareQueue = compareQueue.some(c => c.id === activeLog.id);

  return (
    <>
      <div className="details-overlay active" onClick={() => setIsDrawerOpen(false)}></div>
      <aside className="details-drawer active">
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="material-icons-round drawer-icon">segment</span>
            <h2>Detalle del Registro</h2>
          </div>
          <div className="drawer-header-actions">
            <button 
              className={`icon-button pin-drawer-btn ${isPinned ? 'active' : ''}`} 
              title={isPinned ? "Quitar marcador" : "Fijar log (Marcador)"}
              onClick={() => togglePin(activeLog)}
            >
              <span className="material-icons-round">push_pin</span>
            </button>
            <button 
              id="btn-close-drawer" 
              className="icon-button" 
              onClick={() => setIsDrawerOpen(false)}
            >
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>
        
        <div className="drawer-body">
          <div className="drawer-meta-grid">
            <div className="meta-field">
              <span className="meta-label">ID Registro</span>
              <span className="meta-value">#{activeLog.id}</span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Nivel</span>
              <span className="meta-value">
                <span 
                  className="badge" 
                  style={{ 
                    background: `hsla(${getLevelColor(activeLog.level)},0.12)`, 
                    color: `hsl(${getLevelColor(activeLog.level)})` 
                  }}
                >
                  {activeLog.level}
                </span>
              </span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Marca de Tiempo</span>
              <span className="meta-value">{activeLog.timestamp}</span>
            </div>
            {activeLog.deltaTimeMs !== undefined && (
              <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                <span className="meta-label">Latencia (Delta)</span>
                <span 
                  className={`meta-value latency-value ${
                    activeLog.deltaTimeMs > 5000 
                      ? 'latency-danger' 
                      : activeLog.deltaTimeMs > 1000 
                        ? 'latency-warning' 
                        : 'latency-normal'
                  }`}
                >
                  +{activeLog.deltaTimeMs >= 1000 ? `${(activeLog.deltaTimeMs / 1000).toFixed(2)}s` : `${activeLog.deltaTimeMs}ms`} (desde log previo del mismo flujo)
                </span>
              </div>
            )}
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Servicio o Método</span>
              <span className="meta-value meta-value-accent">{activeLog.service}</span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">ID de Correlación</span>
              <div className="correlation-drawer-value">
                <span className="meta-value meta-value-mono">{activeLog.correlationId}</span>
                {activeLog.correlationId !== '-' && (
                  <button 
                    className="secondary-button compact-btn"
                    title="Aislar este flujo de peticiones"
                    onClick={() => handleIsolateFlow(activeLog.correlationId)}
                  >
                    <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span> Aislar Flujo
                  </button>
                )}
              </div>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Clase / Origen</span>
              <span className="meta-value" title={activeLog.className}>{activeLog.className}</span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Hilo de Ejecución</span>
              <span className="meta-value meta-value-mono">{activeLog.thread}</span>
            </div>
          </div>

          <div className="drawer-actions-row">
            <button 
              className={`secondary-button compare-action-btn ${isInCompareQueue ? 'active' : ''}`}
              disabled={!isInCompareQueue && compareQueue.length >= 2}
              onClick={() => {
                setCompareQueue(prev => {
                  const exists = prev.some(c => c.id === activeLog.id);
                  if (exists) {
                    return prev.filter(c => c.id !== activeLog.id);
                  } else {
                    if (prev.length >= 2) return prev;
                    return [...prev, activeLog];
                  }
                });
              }}
            >
              <span className="material-icons-round">
                {isInCompareQueue ? 'remove_done' : 'compare_arrows'}
              </span>
              <span>{isInCompareQueue ? 'Quitar de Comparar' : 'Agregar a Comparar'}</span>
            </button>
            <button className="primary-button export-md-btn" onClick={() => handleExportMarkdown(activeLog)}>
              <span className="material-icons-round">{exportSuccess ? 'done' : 'bug_report'}</span>
              <span>{exportSuccess ? '¡Copiado a Reporte!' : 'Exportar para Reporte (Markdown)'}</span>
            </button>
          </div>

          {activeDiagnosis && (
            <div className="diagnosis-box">
              <div className="diagnosis-header">
                <span className="material-icons-round">psychology</span>
                <span>LogScope Diagnóstico del Error</span>
              </div>
              <div className="diagnosis-body" dangerouslySetInnerHTML={{ __html: activeDiagnosis }} />
            </div>
          )}

          {(() => {
            const payload = formatPayload(activeLog.message);
            if (payload.kind === 'none') return null;
            
            let payloadContent = payload.kind === 'xml' 
              ? highlightXml(payload.formatted || '') 
              : highlightJson(payload.formatted || '');
            
            // 1. Aplicar búsqueda global del visor si existe
            if (searchTerm) {
              payloadContent = highlightHtmlText(payloadContent, searchTerm, isRegexSearch);
            }

            // 2. Aplicar búsqueda local del drawer e inyectar clase highlight-active de forma precisa
            let totalMatches = 0;
            if (localSearchQuery) {
              // Primero aplicamos el marcado general para la query local
              payloadContent = highlightHtmlText(payloadContent, localSearchQuery, false);

              // Luego contamos y reemplazamos la coincidencia activa con .highlight-active
              let currentMatch = 0;
              payloadContent = payloadContent.replace(/<mark class="highlight-nested">/g, (match) => {
                const idx = currentMatch;
                currentMatch++;
                if (idx === activeMatchIndex) {
                  return '<mark class="highlight-nested highlight-active">';
                }
                return match;
              });
              totalMatches = currentMatch;
            }

            const handlePrevMatch = () => {
              if (totalMatches === 0) return;
              setActiveMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);
            };

            const handleNextMatch = () => {
              if (totalMatches === 0) return;
              setActiveMatchIndex(prev => (prev + 1) % totalMatches);
            };

            const handleSearchSubmit = (e: React.FormEvent) => {
              e.preventDefault();
              handleNextMatch();
            };

            return (
              <div className="drawer-payload-section">
                <div className="drawer-section-title payload-header-row">
                  <span>{payload.title}</span>
                  <div className="payload-copy-actions">
                    <button 
                      type="button"
                      className={`secondary-button copy-btn ${localCopySuccess === 'formatted' ? 'active-success' : ''}`}
                      onClick={() => {
                        copyText(payload.formatted || '');
                        setLocalCopySuccess('formatted');
                        setTimeout(() => setLocalCopySuccess(null), 2000);
                      }}
                      title="Copiar estructurado con saltos de línea"
                    >
                      <span className="material-icons-round" style={{ fontSize: 13 }}>format_align_left</span>
                      <span>{localCopySuccess === 'formatted' ? '¡Copiado!' : 'Copiar Formateado'}</span>
                    </button>
                    <button 
                      type="button"
                      className={`secondary-button copy-btn ${localCopySuccess === 'minified' ? 'active-success' : ''}`}
                      onClick={() => copyMinifiedPayload(payload.formatted || '', payload.kind)}
                      title="Copiar todo en una sola línea (minificado)"
                    >
                      <span className="material-icons-round" style={{ fontSize: 13 }}>horizontal_rule</span>
                      <span>{localCopySuccess === 'minified' ? '¡Copiado!' : 'Copiar en una línea'}</span>
                    </button>
                  </div>
                </div>

                {/* Suite de QA Avanzada (v5.0) */}
                <div className="qa-tools-panel" style={{ 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px dashed var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Replicador & Virtualización QA
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => exportPostmanCollection(activeLog, payload.formatted || '', payload.kind === 'xml')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 4px',
                        borderRadius: '6px',
                        background: 'rgba(255, 112, 67, 0.08)',
                        border: '1px solid rgba(255, 112, 67, 0.25)',
                        color: '#ff7043',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="qa-btn-glow"
                      title="Exportar a Colección de Postman v2.1"
                    >
                      <span className="material-icons-round" style={{ fontSize: '18px' }}>send_and_archive</span>
                      Postman
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => exportJMeterScenario(activeLog, payload.formatted || '', payload.kind === 'xml')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 4px',
                        borderRadius: '6px',
                        background: 'rgba(78, 169, 78, 0.08)',
                        border: '1px solid rgba(78, 169, 78, 0.25)',
                        color: '#4caf50',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="qa-btn-glow"
                      title="Exportar Escenario Apache JMeter .jmx"
                    >
                      <span className="material-icons-round" style={{ fontSize: '18px' }}>stacked_bar_chart</span>
                      JMeter
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => exportWireMockStub(activeLog, payload.formatted || '', payload.kind === 'xml')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 4px',
                        borderRadius: '6px',
                        background: 'rgba(41, 182, 246, 0.08)',
                        border: '1px solid rgba(41, 182, 246, 0.25)',
                        color: '#29b6f6',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="qa-btn-glow"
                      title="Generar Mock Stub para WireMock"
                    >
                      <span className="material-icons-round" style={{ fontSize: '18px' }}>cloud_queue</span>
                      WireMock
                    </button>

                    <button
                      type="button"
                      onClick={() => exportSoapUIProject(activeLog, payload.formatted || '', payload.kind === 'xml')}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 4px',
                        borderRadius: '6px',
                        background: 'rgba(189, 147, 249, 0.08)',
                        border: '1px solid rgba(189, 147, 249, 0.25)',
                        color: '#bd93f9',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="qa-btn-glow"
                      title="Generar Proyecto WSDL/REST para SoapUI"
                    >
                      <span className="material-icons-round" style={{ fontSize: '18px' }}>layers</span>
                      SoapUI
                    </button>
                  </div>
                </div>

                {/* Consola de Búsqueda XPath / JSONPath */}
                <div className="qa-query-console" style={{ 
                  background: 'rgba(30, 34, 42, 0.65)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '12px',
                  marginBottom: '12px',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: 15 }}>terminal</span>
                      Consola {payload.kind === 'xml' ? 'XPath' : 'JSONPath'}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Ej: {payload.kind === 'xml' ? '//soap:Body' : '$.data.id'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="console-query-input"
                      placeholder={`Ingresa consulta ${payload.kind === 'xml' ? 'XPath...' : 'JSONPath...'}`}
                      value={queryPath}
                      onChange={e => setQueryPath(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                    />
                    {queryPath && (
                      <button 
                        type="button" 
                        onClick={() => setQueryPath('')}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-muted)',
                          padding: '0 10px',
                          cursor: 'pointer'
                        }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  {(queryResult !== null || queryError !== null) && (
                    <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Resultado de Consulta
                      </div>
                      {queryError ? (
                        <div style={{ fontSize: '11px', color: '#ff6b6b', fontFamily: 'monospace' }}>{queryError}</div>
                      ) : (
                        <pre style={{ 
                          fontSize: '11px', 
                          color: '#a6e22e', 
                          margin: 0, 
                          whiteSpace: 'pre-wrap', 
                          wordBreak: 'break-all', 
                          fontFamily: 'monospace',
                          maxHeight: '150px',
                          overflowY: 'auto'
                        }}>{queryResult}</pre>
                      )}
                    </div>
                  )}
                </div>

                {/* Barra de Búsqueda Local en Payloads */}
                <div className="payload-search-bar">
                  <div className="payload-search-form">
                    <span className="material-icons-round payload-search-icon">find_in_page</span>
                    <input
                      type="text"
                      className="payload-search-input"
                      placeholder="Buscar tags, llaves o valores en payload..."
                      value={localSearchQuery}
                      onChange={e => {
                        setLocalSearchQuery(e.target.value);
                        setActiveMatchIndex(0);
                      }}
                    />
                    {localSearchQuery && (
                      <div className="payload-search-meta">
                        <span className="matches-counter">
                          {totalMatches > 0 ? `${activeMatchIndex + 1} / ${totalMatches}` : '0 / 0'}
                        </span>
                        <button
                          type="button"
                          className="payload-nav-btn"
                          onClick={handlePrevMatch}
                          disabled={totalMatches === 0}
                          title="Anterior coincidencia"
                        >
                          <span className="material-icons-round">expand_less</span>
                        </button>
                        <button
                          type="button"
                          className="payload-nav-btn"
                          onClick={handleNextMatch}
                          disabled={totalMatches === 0}
                          title="Siguiente coincidencia"
                        >
                          <span className="material-icons-round">expand_more</span>
                        </button>
                        <button
                          type="button"
                          className="payload-search-clear"
                          onClick={() => {
                            setLocalSearchQuery('');
                            setActiveMatchIndex(0);
                          }}
                        >
                          <span className="material-icons-round">close</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {payload.prefix && <div className="payload-prefix">{escapeHtml(payload.prefix)}</div>}
                <pre className="text-area-box formatted-box" dangerouslySetInnerHTML={{ __html: payloadContent }} />
                {payload.suffix && <div className="payload-suffix">{escapeHtml(payload.suffix)}</div>}
              </div>
            );
          })()}

          <details className="raw-details">
            <summary className="drawer-section-title" style={{ cursor: 'pointer' }}>
              <span>Mensaje del Registro (Crudo)</span>
              <button 
                className="secondary-button copy-btn" 
                onClick={e => { e.preventDefault(); e.stopPropagation(); copyText(activeLog.message); }}
              >
                <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
              </button>
            </summary>
            <div className="text-area-box raw-box">{escapeHtml(activeLog.message)}</div>
          </details>
        </div>
      </aside>
    </>
  );
};
