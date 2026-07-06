import React from 'react';
import { FilterState } from '../../../application/usecases/applyFilters';

interface QuickFilterPillsProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const QuickFilterPills: React.FC<QuickFilterPillsProps> = ({
  filters,
  setFilters,
  setCurrentPage
}) => {
  const pills = [
    { id: 'NONE', label: 'Todos los Logs', icon: 'clear_all', color: 'gray' },
    { id: 'LATENCY', label: 'Latencia Crítica (>2s)', icon: 'speed', color: 'amber' },
    { id: 'INTEGRATION_ERRORS', label: 'Errores SOAP / Timeout', icon: 'report_problem', color: 'red' },
    { id: 'SOAP_TRAFFIC', label: 'Tráfico SOAP (XML)', icon: 'code', color: 'purple' },
    { id: 'REQUESTS', label: 'Peticiones (REQ)', icon: 'arrow_forward', color: 'blue' },
    { id: 'RESPONSES', label: 'Respuestas (RESP)', icon: 'arrow_back', color: 'green' }
  ];

  return (
    <div className="filter-row qa-quick-row">
      <div className="quick-filters-wrapper">
        <span className="filter-group-label">DIAGNÓSTICO QA:</span>
        <div className="quick-filter-pills">
          {pills.map(pill => {
            const active = (filters.quickFilter || 'NONE') === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                className={`quick-pill-btn qa-pill-${pill.color} ${active ? 'active' : ''}`}
                onClick={() => {
                  setFilters(p => ({ ...p, quickFilter: pill.id as any }));
                  setCurrentPage(1);
                }}
              >
                <span className="material-icons-round pill-icon">{pill.icon}</span>
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
