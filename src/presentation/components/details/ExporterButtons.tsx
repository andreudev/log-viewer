import React, { useCallback } from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';

interface ExporterButtonsProps {
  activeLog: LogEntry;
  payloadText: string;
  isXml: boolean;
}

export const ExporterButtons: React.FC<ExporterButtonsProps> = ({
  activeLog,
  payloadText,
  isXml
}) => {

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

  const exportPostmanCollection = useCallback(() => {
    const serviceName = activeLog.service !== '-' ? activeLog.service : `Log #${activeLog.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = activeLog.service.startsWith('/') ? activeLog.service : `/services/${activeLog.service}`;
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
        _postman_id: `logscope-${activeLog.id}-${Date.now()}`,
        name: `LogScope Replicator - ${serviceName}`,
        description: `Colección generada automáticamente a partir del log #${activeLog.id} del servicio ${serviceName}.`,
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
                value: activeLog.correlationId
              },
              {
                key: "X-LogScope-Origin",
                value: `LogEntry-${activeLog.id}`
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
      `postman_collection_${cleanServiceName}_log_${activeLog.id}.json`,
      'application/json'
    );
  }, [activeLog, payloadText, isXml, triggerDownload]);

  const exportJMeterScenario = useCallback(() => {
    const serviceName = activeLog.service !== '-' ? activeLog.service : `Log #${activeLog.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = activeLog.service.startsWith('/') ? activeLog.service : `/services/${activeLog.service}`;
    
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
                <stringProp name="Header.value">${activeLog.correlationId}</stringProp>
              </elementProp>
              <elementProp name="" elementType="Header">
                <stringProp name="Header.name">X-LogScope-Origin</stringProp>
                <stringProp name="Header.value">LogEntry-${activeLog.id}</stringProp>
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
      `jmeter_scenario_${cleanServiceName}_log_${activeLog.id}.jmx`,
      'application/xml'
    );
  }, [activeLog, payloadText, isXml, triggerDownload]);

  const exportWireMockStub = useCallback(() => {
    const serviceName = activeLog.service !== '-' ? activeLog.service : `Log #${activeLog.id}`;
    const contentType = isXml ? 'application/xml' : 'application/json';
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = activeLog.service.startsWith('/') ? activeLog.service : `/services/${activeLog.service}`;
    
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
          "X-Correlation-ID": activeLog.correlationId
        }
      }
    };
    
    triggerDownload(
      JSON.stringify(stub, null, 2),
      `wiremock_stub_${cleanServiceName}_log_${activeLog.id}.json`,
      'application/json'
    );
  }, [activeLog, payloadText, isXml, triggerDownload]);

  const exportSoapUIProject = useCallback(() => {
    const serviceName = activeLog.service !== '-' ? activeLog.service : `Log #${activeLog.id}`;
    const cleanServiceName = serviceName.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const path = activeLog.service.startsWith('/') ? activeLog.service : `/services/${activeLog.service}`;
    
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
      <con:call id="${callUuid}" name="Petición Log #${activeLog.id}">
        <con:settings>
          <con:setting id="com.eviware.soapui.impl.wsdl.WsdlRequest@request-headers">&lt;xml-fragment xmlns:con="http://eviware.com/soapui/config"&gt;&lt;con:entry key="X-Correlation-ID" value="${activeLog.correlationId}"/&gt;&lt;con:entry key="X-LogScope-Origin" value="LogEntry-${activeLog.id}"/&gt;&lt;/xml-fragment&gt;</con:setting>
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
        <con:request name="Petición Log #${activeLog.id}" id="${callUuid}" mediaType="application/json" postQueryString="false">
          <con:settings>
            <con:setting id="com.eviware.soapui.impl.support.AbstractHttpRequest@request-headers">&lt;xml-fragment xmlns:con="http://eviware.com/soapui/config"&gt;&lt;con:entry key="X-Correlation-ID" value="${activeLog.correlationId}"/&gt;&lt;con:entry key="X-LogScope-Origin" value="LogEntry-${activeLog.id}"/&gt;&lt;/xml-fragment&gt;</con:setting>
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
      `soapui_project_${cleanServiceName}_log_${activeLog.id}.xml`,
      'application/xml'
    );
  }, [activeLog, payloadText, isXml, triggerDownload]);

  return (
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
          onClick={exportPostmanCollection}
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
          onClick={exportJMeterScenario}
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
          onClick={exportWireMockStub}
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
          onClick={exportSoapUIProject}
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
  );
};
