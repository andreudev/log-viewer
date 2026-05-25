import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Algo salió mal';
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <span className="material-icons-round">bug_report</span>
            </div>
            <h3 className="error-boundary-title">{title}</h3>
            <p className="error-boundary-message">
              Se produjo un error inesperado en este panel. Los demás paneles de la aplicación no se ven afectados.
            </p>
            {this.state.error && (
              <details className="error-boundary-details">
                <summary>Detalles técnicos</summary>
                <pre>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre className="error-boundary-stack">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
            <button className="error-boundary-retry" onClick={this.handleRetry}>
              <span className="material-icons-round" style={{ fontSize: 16, marginRight: 6 }}>refresh</span>
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
