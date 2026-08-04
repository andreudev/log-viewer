import React, { useState } from 'react';
import { LogFileMeta } from '../../infrastructure/api/filesApi';
import { LogEntry } from '../../domain/models/LogEntry';
import { PromotionRule } from '../../domain/models/PromotionRule';
import { SshConnectionConfig } from '../hooks/useLogViewerState';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  // Theme selector
  theme: string;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
  
  // Session QA
  exportSession: () => void;
  importSession: (jsonData: any) => boolean;
  
  // Desktop notifications
  desktopAlertsEnabled: boolean;
  toggleDesktopAlerts: () => void;
  
  // Webhooks
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  webhookType: 'slack' | 'discord' | 'teams';
  setWebhookType: (type: 'slack' | 'discord' | 'teams') => void;
  webhookEnabled: boolean;
  setWebhookEnabled: (enabled: boolean) => void;
  sendTestWebhook: () => void;
  
  // SSH Connections
  sshConnections: SshConnectionConfig[];
  sshLoading: boolean;
  sshError: string | null;
  saveSshConnection: (config: SshConnectionConfig) => Promise<void>;
  deleteSshConnection: (id: string) => Promise<void>;
  testSshConnectionConfig: (config: SshConnectionConfig) => Promise<string>;
  
  // Rules
  rules: PromotionRule[];
  setRules: React.Dispatch<React.SetStateAction<PromotionRule[]>>;
  openRulesModal: () => void;

  // Local logs directory settings
  localLogsDir: string;
  saveLocalLogsDir: (dirPath: string) => Promise<void>;

  // AI settings
  systemSettings: any;
  updateSystemSettings: (settings: any) => Promise<void>;
}

type TabType = 'ssh' | 'webhooks' | 'alerts' | 'rules' | 'appearance' | 'session' | 'local-dir' | 'ai';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  setTheme,
  exportSession,
  importSession,
  desktopAlertsEnabled,
  toggleDesktopAlerts,
  webhookUrl,
  setWebhookUrl,
  webhookType,
  setWebhookType,
  webhookEnabled,
  setWebhookEnabled,
  sendTestWebhook,
  sshConnections,
  sshLoading,
  sshError,
  saveSshConnection,
  deleteSshConnection,
  testSshConnectionConfig,
  rules,
  setRules,
  openRulesModal,
  localLogsDir,
  saveLocalLogsDir,
  systemSettings,
  updateSystemSettings
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('ssh');
  
  // Local logs directory form states
  const [inputLocalDir, setInputLocalDir] = useState('');
  const [saveLocalResult, setSaveLocalResult] = useState<string | null>(null);
  const [saveLocalError, setSaveLocalError] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);

  // AI Settings form states
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai-compatible' | 'ollama' | 'nvidia' | 'custom-json'>('gemini');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const [testAiResult, setTestAiResult] = useState<string | null>(null);
  const [testAiError, setTestAiError] = useState<string | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [saveAiResult, setSaveAiResult] = useState<string | null>(null);
  const [saveAiError, setSaveAiError] = useState<string | null>(null);

  // Sync prop to input state when opened or updated
  React.useEffect(() => {
    if (isOpen) {
      setInputLocalDir(localLogsDir);
      setSaveLocalResult(null);
      setSaveLocalError(null);
      
      // Sync AI states
      setAiEnabled(systemSettings.aiEnabled || false);
      setAiProvider(systemSettings.aiProvider || 'gemini');
      setAiApiKey(systemSettings.hasAiApiKey ? '******' : '');
      setAiEndpoint(systemSettings.aiEndpoint || '');
      setAiModel(systemSettings.aiModel || '');
      setTestAiResult(null);
      setTestAiError(null);
      setSaveAiResult(null);
      setSaveAiError(null);
    }
  }, [isOpen, localLogsDir, systemSettings]);

  const handleTestAi = async () => {
    setTestingAi(true);
    setTestAiResult(null);
    setTestAiError(null);
    try {
      // Si la API Key es la máscara "******", no la enviamos para que el servidor use la guardada
      const apiKeyToSend = aiApiKey === '******' ? undefined : aiApiKey;
      
      const response = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider,
          aiApiKey: apiKeyToSend,
          aiEndpoint,
          aiModel
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}: ${JSON.stringify(data)}`);
      }
      setTestAiResult(`Conexión exitosa! El modelo respondió: "${data.response}"`);
    } catch (err: any) {
      setTestAiError(err.message || 'Error de conexión');
    } finally {
      setTestingAi(false);
    }
  };

  // SSH Local Form States
  const [sshName, setSshName] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('');
  const [sshAuthType, setSshAuthType] = useState<'password' | 'key'>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshLogDir, setSshLogDir] = useState('.');
  const [sshSudoPassword, setSshSudoPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSshForm, setShowSshForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetSshForm = () => {
    setEditingId(null);
    setSshName('');
    setSshHost('');
    setSshPort('22');
    setSshUser('');
    setSshAuthType('password');
    setSshPassword('');
    setSshPrivateKey('');
    setSshLogDir('.');
    setSshSudoPassword('');
    setTestResult(null);
    setTestError(null);
    setShowSshForm(false);
  };

  const handleEditSsh = (conn: SshConnectionConfig) => {
    setEditingId(conn.id || null);
    setSshName(conn.name);
    setSshHost(conn.host);
    setSshPort(String(conn.port || 22));
    setSshUser(conn.username);
    setSshAuthType(conn.authType);
    setSshPassword('');
    setSshPrivateKey('');
    setSshLogDir(conn.logDir || '.');
    setSshSudoPassword('');
    setTestResult(null);
    setTestError(null);
    setShowSshForm(true);
  };

  const handleTestSsh = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const msg = await testSshConnectionConfig({
        id: editingId || undefined,
        name: sshName,
        host: sshHost,
        port: parseInt(sshPort, 10) || 22,
        username: sshUser,
        authType: sshAuthType,
        password: sshAuthType === 'password' ? sshPassword : '',
        privateKeyContent: sshAuthType === 'key' ? sshPrivateKey : '',
        logDir: sshLogDir,
        sudoPassword: sshSudoPassword
      });
      setTestResult(msg);
    } catch (err: any) {
      setTestError(err.message || 'Error de conexión');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmitSsh = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSshConnection({
        id: editingId || undefined,
        name: sshName,
        host: sshHost,
        port: parseInt(sshPort, 10) || 22,
        username: sshUser,
        authType: sshAuthType,
        password: sshAuthType === 'password' ? sshPassword : '',
        privateKeyContent: sshAuthType === 'key' ? sshPrivateKey : '',
        logDir: sshLogDir,
        sudoPassword: sshSudoPassword
      });
      resetSshForm();
    } catch (err: any) {
      setTestError(err.message);
    }
  };

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 250 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '960px', 
          maxHeight: '650px', 
          height: '85vh',
          width: '90vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round">settings</span>
            <h2>Ajustes del Sistema</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar Ajustes" title="Cerrar Ajustes">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Modal Main Body (Split View) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Navigation Panel (Left) */}
          <div 
            style={{ 
              width: '230px', 
              background: 'var(--bg-sidebar)', 
              borderRight: '1px solid var(--border-color)',
              display: 'flex', 
              flexDirection: 'column',
              padding: '12px 8px',
              gap: '4px'
            }}
          >
            <button
              onClick={() => setActiveTab('local-dir')}
              className={`tab-btn ${activeTab === 'local-dir' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'local-dir' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'local-dir' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'local-dir' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>folder</span>
              <span>Directorio Local</span>
            </button>

            <button
              onClick={() => setActiveTab('ssh')}
              className={`tab-btn ${activeTab === 'ssh' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'ssh' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'ssh' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'ssh' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>dns</span>
              <span>Servidores SSH</span>
            </button>

            <button
              onClick={() => setActiveTab('webhooks')}
              className={`tab-btn ${activeTab === 'webhooks' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'webhooks' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'webhooks' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'webhooks' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>sync_alt</span>
              <span>Webhooks & Canales</span>
            </button>

            <button
              onClick={() => setActiveTab('alerts')}
              className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'alerts' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'alerts' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'alerts' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>notifications_active</span>
              <span>Notificaciones Alertas</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'ai' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'ai' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'ai' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>psychology</span>
              <span>Asistente de IA</span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'rules' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'rules' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'rules' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>rule</span>
              <span>Reglas de Alerta QA</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'appearance' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'appearance' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'appearance' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>palette</span>
              <span>Tema Visual Pro</span>
            </button>

            <button
              onClick={() => setActiveTab('session')}
              className={`tab-btn ${activeTab === 'session' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: 'none',
                background: activeTab === 'session' ? 'var(--accent-bg)' : 'transparent',
                color: activeTab === 'session' ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: activeTab === 'session' ? 600 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '18px' }}>history_edu</span>
              <span>Sesiones de Prueba</span>
            </button>
          </div>

          {/* Content Panel (Right) */}
          <div 
            style={{ 
              flex: 1, 
              background: 'var(--bg-panel)', 
              padding: '24px', 
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            {/* TAB: LOCAL DIRECTORY PATH */}
            {activeTab === 'local-dir' && (
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingLocal(true);
                  setSaveLocalResult(null);
                  setSaveLocalError(null);
                  try {
                    await saveLocalLogsDir(inputLocalDir);
                    setSaveLocalResult('Directorio local actualizado y guardado correctamente.');
                  } catch (err: any) {
                    setSaveLocalError(err.message || 'Error al guardar el directorio');
                  } finally {
                    setSavingLocal(false);
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Ruta del Directorio Local</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Establece la ruta absoluta en el servidor donde se encuentran tus archivos de logs locales (.log / .txt).
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>RUTA ABSOLUTA DEL DIRECTORIO</span>
                    <input
                      type="text"
                      placeholder="Ej: /home/user/logs"
                      required
                      value={inputLocalDir}
                      onChange={e => setInputLocalDir(e.target.value)}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        fontSize: '13px',
                        outline: 'none',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  {saveLocalResult && (
                    <div style={{ padding: '8px 12px', background: 'rgba(152,195,121,0.1)', border: '1px solid rgba(152,195,121,0.2)', borderRadius: '6px', color: '#98c379', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                      <span>{saveLocalResult}</span>
                    </div>
                  )}
                  {saveLocalError && (
                    <div style={{ padding: '8px 12px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>warning</span>
                      <span>{saveLocalError}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="submit"
                      disabled={savingLocal}
                      className="primary-button"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                    >
                      <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px' }}>save</span>
                      {savingLocal ? 'Guardando...' : 'Guardar Ruta'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB: SSH CONNECTIONS */}
            {activeTab === 'ssh' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Nodos de Servidores SSH</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Configura servidores remotos para recuperar y visualizar logs mediante SFTP y SSH.
                    </p>
                  </div>
                  {!showSshForm && (
                    <button
                      type="button"
                      aria-label="Anadir nuevo servidor SSH"
                      onClick={() => {
                        resetSshForm();
                        setShowSshForm(true);
                      }}
                      className="primary-button"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span className="material-icons-round" aria-hidden="true">add</span>
                      Añadir Servidor
                    </button>
                  )}
                </div>

                {showSshForm ? (
                  <form 
                    onSubmit={handleSubmitSsh}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'rgba(0,0,0,0.15)',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      gap: '12px'
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--accent-solid)' }}>
                      {editingId ? 'Editar Servidor SSH' : 'Nuevo Servidor SSH'}
                    </h4>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>NOMBRE DEL SERVIDOR</span>
                        <input
                          type="text"
                          placeholder="Ej: Balanceador Nodo A"
                          required
                          value={sshName}
                          onChange={e => setSshName(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>HOST / DIRECCIÓN IP</span>
                        <input
                          type="text"
                          placeholder="192.168.10.12"
                          required
                          value={sshHost}
                          onChange={e => setSshHost(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>PUERTO SSH</span>
                        <input
                          type="number"
                          placeholder="22"
                          value={sshPort}
                          onChange={e => setSshPort(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>USUARIO SSH</span>
                        <input
                          type="text"
                          placeholder="ubuntu / centos / root"
                          required
                          value={sshUser}
                          onChange={e => setSshUser(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>TIPO DE AUTENTICACIÓN</span>
                        <select
                          value={sshAuthType}
                          onChange={e => setSshAuthType(e.target.value as any)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="password">Contraseña Clásica</option>
                          <option value="key">Clave Privada RSA/PEM</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>DIRECTORIO DE LOGS REMOTO</span>
                        <input
                          type="text"
                          placeholder="Ej: /var/log/app"
                          value={sshLogDir}
                          onChange={e => setSshLogDir(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                      </div>
                    </div>

                    {sshAuthType === 'password' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>CONTRASEÑA</span>
                        <input
                          type="password"
                          placeholder="Ingresa la contraseña del servidor"
                          value={sshPassword}
                          onChange={e => setSshPassword(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>CONTENIDO DE CLAVE PRIVADA PEM</span>
                        <textarea
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                          value={sshPrivateKey}
                          onChange={e => setSshPrivateKey(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            minHeight: '100px',
                            outline: 'none',
                            resize: 'vertical'
                          }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        CONTRASEÑA DE SUDO (OPCIONAL)
                        <span
                          title="Se usa para ejecutar 'sudo chmod 777' automaticamente cuando un archivo del servidor pierde permisos de lectura. Queda encriptada igual que la contraseña SSH."
                          style={{ cursor: 'help', color: 'var(--text-muted)', display: 'inline-flex' }}
                        >
                          <span className="material-icons-round" style={{ fontSize: '13px' }}>info</span>
                        </span>
                      </span>
                      <input
                        type="password"
                        placeholder={sshAuthType === 'key' ? 'tjmtHrhfy' : 'Ingresa la contraseña de sudo para auto-fix de permisos'}
                        value={sshSudoPassword}
                        onChange={e => setSshSudoPassword(e.target.value)}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {testResult && (
                      <div style={{ padding: '8px 12px', background: 'rgba(152,195,121,0.1)', border: '1px solid rgba(152,195,121,0.2)', borderRadius: '6px', color: '#98c379', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                        <span>{testResult}</span>
                      </div>
                    )}
                    {testError && (
                      <div style={{ padding: '8px 12px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', wordBreak: 'break-all' }}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>warning</span>
                        <span>{testError}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={resetSshForm}
                        style={{ padding: '8px 16px' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={testing}
                        onClick={handleTestSsh}
                        className="secondary-button"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>power</span>
                        {testing ? 'Probando...' : 'Probar Conexión'}
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        style={{ padding: '8px 16px' }}
                      >
                        {editingId ? 'Actualizar Servidor' : 'Guardar Servidor'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sshConnections.length === 0 ? (
                      <div 
                        style={{ 
                          padding: '30px', 
                          border: '2px dashed var(--border-color)', 
                          borderRadius: '8px', 
                          textAlign: 'center',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '40px', opacity: 0.5, marginBottom: '8px' }}>dns</span>
                        <p style={{ margin: 0, fontSize: '13px' }}>No hay servidores SSH registrados actualmente.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {sshConnections.map(conn => (
                          <div 
                            key={conn.id}
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              background: 'rgba(255,255,255,0.02)',
                              padding: '12px 14px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              justifyContent: 'space-between',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {conn.name}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                                {conn.username}@{conn.host}:{conn.port}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '4px' }}>
                                Logs: {conn.logDir}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px' }}>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Editar servidor SSH ${conn.name}`}
                                title="Editar"
                                onClick={() => handleEditSsh(conn)}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}
                              >
                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px' }}>edit</span>
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Eliminar servidor SSH ${conn.name}`}
                                title="Eliminar"
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar servidor SSH "${conn.name}"?`)) {
                                    deleteSshConnection(conn.id || '');
                                  }
                                }}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(224,108,117,0.1)', color: '#e06c75' }}
                              >
                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px' }}>delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB: WEBHOOKS */}
            {activeTab === 'webhooks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Integración de Webhooks</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Envía notificaciones de incidentes en caliente a tus canales de comunicación cuando se detecten errores.
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Activar Integración de Webhooks</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Retransmite de forma automatizada las alertas promocionadas y fallos fatales de logs.
                      </span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={webhookEnabled} 
                        onChange={(e) => setWebhookEnabled(e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {webhookEnabled && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>TIPO DE CANAL</span>
                        <select
                          value={webhookType}
                          onChange={(e) => setWebhookType(e.target.value as any)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="slack">Slack (Blocks de Mensaje)</option>
                          <option value="discord">Discord (Webhooks Embeds)</option>
                          <option value="teams">Microsoft Teams (MessageCard)</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>URL DEL WEBHOOK</span>
                        <input
                          type="text"
                          placeholder="https://hooks.slack.com/services/... o https://discord.com/api/webhooks/..."
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                          type="button"
                          onClick={sendTestWebhook}
                          disabled={!webhookUrl}
                          className="secondary-button"
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '8px 16px',
                            background: webhookUrl ? 'rgba(97, 175, 239, 0.12)' : 'rgba(255,255,255,0.02)',
                            color: webhookUrl ? '#61afef' : 'var(--text-muted)',
                            border: '1px solid ' + (webhookUrl ? 'rgba(97, 175, 239, 0.2)' : 'var(--border-color)')
                          }}
                        >
                          <span className="material-icons-round" style={{ fontSize: '16px' }}>send</span>
                          Enviar Mensaje de Prueba
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB: SYSTEM ALERTS */}
            {activeTab === 'alerts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Notificaciones de Escritorio</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Recibe notificaciones en tu sistema operativo cuando se detecten fallos y el visualizador se encuentre en segundo plano.
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Alertas de Inactividad Nativas</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Notificar errores críticos (ERROR/WARN) en segundo plano mediante alertas del sistema operativo.
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={desktopAlertsEnabled} 
                      onChange={toggleDesktopAlerts} 
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            )}

            {/* TAB: ASISTENTE DE IA */}
            {activeTab === 'ai' && (
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingAi(true);
                  setSaveAiResult(null);
                  setSaveAiError(null);
                  try {
                    await updateSystemSettings({
                      aiEnabled,
                      aiProvider,
                      aiApiKey: aiApiKey === '******' ? undefined : aiApiKey,
                      aiEndpoint,
                      aiModel
                    });
                    setSaveAiResult('Configuración del Asistente de IA guardada con éxito.');
                  } catch (err: any) {
                    setSaveAiError(err.message || 'Error al guardar la configuración');
                  } finally {
                    setSavingAi(false);
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Configuración de Diagnóstico por IA</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Conéctate con modelos locales (Ollama) o nubes de IA (Google Gemini, DeepSeek, Qwen o endpoints compatibles con OpenAI) para recibir explicaciones y sugerencias automatizadas.
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="custom-checkbox-container" style={{ margin: 0, display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        checked={aiEnabled} 
                        onChange={(e) => setAiEnabled(e.target.checked)} 
                      />
                      <span className="checkmark"></span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Activar Asistente de Diagnóstico por IA</span>
                    </label>
                  </div>

                  {aiEnabled && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>PROVEEDOR DE IA</span>
                        <select
                          value={aiProvider}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setAiProvider(val);
                            if (val === 'gemini') {
                              setAiModel('gemini-1.5-flash');
                              setAiEndpoint('');
                            } else if (val === 'ollama') {
                              setAiModel('llama3');
                              setAiEndpoint('http://localhost:11434');
                            } else if (val === 'nvidia') {
                              setAiModel('meta/llama-3.3-70b-instruct');
                              setAiEndpoint('https://integrate.api.nvidia.com/v1');
                            } else if (val === 'openai-compatible') {
                              setAiModel('gpt-4o');
                              setAiEndpoint('https://api.openai.com/v1');
                            } else if (val === 'custom-json') {
                              setAiModel('deepseek-chat');
                              setAiEndpoint('https://api.deepseek.com/v1');
                            }
                          }}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="gemini">Google Gemini API</option>
                          <option value="openai-compatible">OpenAI Compatible (ChatGPT, DeepSeek, Qwen, etc.)</option>
                          <option value="nvidia">NVIDIA NIM (Llama, Mixtral)</option>
                          <option value="ollama">Ollama (Local)</option>
                          <option value="custom-json">Cualquier otra AI (JSON Personalizado)</option>
                        </select>
                      </div>

                      {aiProvider === 'custom-json' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(255,255,0,0.05)', border: '1px solid rgba(255,255,0,0.1)', borderRadius: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#e5c07b', fontWeight: 600 }}>MODO DE COMPATIBILIDAD UNIVERSAL</span>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Este modo envía un POST JSON estándar con `model`, `messages` y `stream: false`. Compatible con la mayoría de proveedores chinos (DeepSeek, ZhipuAI, Baichuan) y otros servicios REST.
                          </p>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>IDENTIFICADOR DEL MODELO</span>
                          <input
                            type="text"
                            placeholder={aiProvider === 'gemini' ? 'gemini-1.5-flash' : (aiProvider === 'ollama' ? 'llama3' : 'deepseek-chat')}
                            required
                            value={aiModel}
                            onChange={e => setAiModel(e.target.value)}
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              borderRadius: '6px',
                              padding: '8px 12px',
                              fontSize: '13px',
                              outline: 'none',
                              fontFamily: 'var(--font-mono)'
                            }}
                          />
                        </div>

                        {aiProvider !== 'gemini' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>ENDPOINT BASE URL</span>
                            <input
                              type="text"
                              placeholder={aiProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.deepseek.com/v1'}
                              required
                              value={aiEndpoint}
                              onChange={e => setAiEndpoint(e.target.value)}
                              style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '13px',
                                outline: 'none',
                                fontFamily: 'var(--font-mono)'
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {aiProvider !== 'ollama' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>CLAVE API (API KEY)</span>
                          <input
                            type="password"
                            placeholder={aiApiKey === '******' ? 'Dejar como está para mantener la contraseña actual' : 'Ingresa la clave API del proveedor'}
                            value={aiApiKey}
                            onChange={e => setAiApiKey(e.target.value)}
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              borderRadius: '6px',
                              padding: '8px 12px',
                              fontSize: '13px',
                              outline: 'none',
                              fontFamily: 'var(--font-mono)'
                            }}
                          />
                        </div>
                      )}

                      {testAiResult && (
                        <div style={{ padding: '8px 12px', background: 'rgba(152,195,121,0.1)', border: '1px solid rgba(152,195,121,0.2)', borderRadius: '6px', color: '#98c379', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                          <span>{testAiResult}</span>
                        </div>
                      )}
                      {testAiError && (
                        <div style={{ padding: '8px 12px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', wordBreak: 'break-all' }}>
                          <span className="material-icons-round" style={{ fontSize: '16px' }}>warning</span>
                          <span>{testAiError}</span>
                        </div>
                      )}
                    </>
                  )}

                  {saveAiResult && (
                    <div style={{ padding: '8px 12px', background: 'rgba(152,195,121,0.1)', border: '1px solid rgba(152,195,121,0.2)', borderRadius: '6px', color: '#98c379', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                      <span>{saveAiResult}</span>
                    </div>
                  )}
                  {saveAiError && (
                    <div style={{ padding: '8px 12px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>warning</span>
                      <span>{saveAiError}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    {aiEnabled && (
                      <button
                        type="button"
                        disabled={testingAi}
                        onClick={handleTestAi}
                        className="secondary-button"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>power</span>
                        {testingAi ? 'Probando...' : 'Probar Conexión'}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingAi}
                      className="primary-button"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                    >
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>save</span>
                      {savingAi ? 'Guardando...' : 'Guardar Ajustes'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB: RULES */}
            {activeTab === 'rules' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Reglas de Alerta QA</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Promociona la severidad de un log (ej. DEBUG a WARN) si coincide con un patrón específico.
                    </p>
                  </div>
                  <button 
                    onClick={openRulesModal} 
                    className="primary-button"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-icons-round">edit</span>
                    Editar JSON Reglas
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {rules.length === 0 ? (
                    <div style={{ padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No hay reglas de alerta configuradas actualmente.
                    </div>
                  ) : (
                    rules.map(rule => (
                      <div 
                        key={rule.id}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: '12px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rule.pattern}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Acción: Elevar severidad a <b style={{ color: 'var(--accent-solid)' }}>{rule.targetLevel}</b>
                          </span>
                        </div>
                        <label className="toggle-switch">
                          <input 
                            type="checkbox" 
                            checked={rule.enabled} 
                            onChange={() => {
                              setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                            }} 
                          />
                          <span className="slider"></span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: VISUAL THEME */}
            {activeTab === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Apariencia Visual (Temas)</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Personaliza los colores, fondos y contrastes del dashboard seleccionando un tema visual premium.
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    gap: '10px'
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>TEMA VISUAL PRO</span>
                  <select 
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                    }}
                  >
                    <option value="dark-theme">One Dark Pro (Oscuro por Defecto)</option>
                    <option value="light-theme">One Light Pro (Claro)</option>
                    <option value="dracula-theme">Dracula Vampire (Púrpura Hacker)</option>
                    <option value="nord-theme">Nordic Frost (Gris Ártico)</option>
                    <option value="cyberpunk-theme">Cyberpunk Neon (Cian / Magenta)</option>
                    <option value="glass-theme">Glassmorphism (Cristal Templado)</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB: SESSIONS */}
            {activeTab === 'session' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'tail-fade-in 0.2s ease-out' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Importación / Exportación de Sesiones</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Exporta tus marcadores, filtros y logs cargados para compartirlos con otros ingenieros de QA.
                  </p>
                </div>

                <div 
                  style={{ 
                    display: 'flex', 
                    gap: '12px',
                    background: 'rgba(0,0,0,0.15)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <button 
                    className="primary-button" 
                    onClick={exportSession}
                    style={{ 
                      flex: 1, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      padding: '12px'
                    }}
                  >
                    <span className="material-icons-round">download</span>
                    <span>Exportar Sesión QA</span>
                  </button>

                  <button 
                    className="secondary-button" 
                    onClick={() => document.getElementById('modal-session-file-input')?.click()}
                    style={{ 
                      flex: 1, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      padding: '12px'
                    }}
                  >
                    <span className="material-icons-round">upload_file</span>
                    <span>Importar Sesión QA</span>
                  </button>

                  <input 
                    type="file" 
                    id="modal-session-file-input" 
                    accept=".json" 
                    style={{ display: 'none' }} 
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          try {
                            const parsed = JSON.parse(evt.target?.result as string);
                            const success = importSession(parsed);
                            if (success) {
                              alert("Sesión QA restaurada con éxito.");
                              onClose();
                            } else {
                              alert("Error al restaurar el archivo de sesión.");
                            }
                          } catch (err) {
                            alert("Archivo JSON no válido.");
                          }
                        };
                        reader.readAsText(file);
                      }
                    }} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
