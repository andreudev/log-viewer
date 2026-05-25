import React, { useState, useEffect, useRef } from 'react';
import { FilterState } from '../../../application/usecases/applyFilters';

interface DateRangePickerProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  logDateRange: { min: Date | null; max: Date | null; minStr: string; maxStr: string };
  applyTimePreset: (minutes: number) => void;
  applyFullDateRange: () => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  filters,
  setFilters,
  setCurrentPage,
  logDateRange,
  applyTimePreset,
  applyFullDateRange
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const getSafeDate = (d: any): Date | null => {
    if (!d) return null;
    const dateObj = (d instanceof Date) ? d : new Date(d);
    return !isNaN(dateObj.getTime()) ? dateObj : null;
  };

  // Estados locales para el Custom Date & Time Picker interactivo
  const [tempDateFrom, setTempDateFrom] = useState<Date | null>(() => getSafeDate(filters.dateFrom));
  const [tempDateTo, setTempDateTo] = useState<Date | null>(() => getSafeDate(filters.dateTo));
  const [activeTab, setActiveTab] = useState<'from' | 'to'>('from');
  const [viewDate, setViewDate] = useState<Date>(() => {
    const safeFrom = getSafeDate(filters.dateFrom);
    const safeTo = getSafeDate(filters.dateTo);
    const safeMin = getSafeDate(logDateRange.min);
    const initialDate = safeFrom || safeTo || safeMin || new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });

  // Sincronizar estados locales con filtros activos al abrir el popover
  useEffect(() => {
    if (isDatePickerOpen) {
      setTempDateFrom(getSafeDate(filters.dateFrom));
      setTempDateTo(getSafeDate(filters.dateTo));
      
      const safeFrom = getSafeDate(filters.dateFrom);
      const safeTo = getSafeDate(filters.dateTo);
      const safeMin = getSafeDate(logDateRange.min);
      const initialDate = safeFrom || safeTo || safeMin || new Date();
      setViewDate(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
      setActiveTab('from');
    }
  }, [isDatePickerOpen, filters.dateFrom, filters.dateTo, logDateRange.min]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const WEEKDAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  const daysArray = React.useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Rellenar días del mes anterior
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        day: prevMonthTotalDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false
      });
    }

    // Rellenar días del mes actual
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        day: i,
        month,
        year,
        isCurrentMonth: true
      });
    }

    // Rellenar días del mes siguiente
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false
      });
    }

    return days;
  }, [year, month]);

  const handleDayClick = (dayObj: { day: number; month: number; year: number }) => {
    const clickedDate = new Date(dayObj.year, dayObj.month, dayObj.day);
    
    if (activeTab === 'from') {
      const hours = tempDateFrom ? tempDateFrom.getHours() : 0;
      const minutes = tempDateFrom ? tempDateFrom.getMinutes() : 0;
      clickedDate.setHours(hours, minutes, 0, 0);
      setTempDateFrom(clickedDate);
      setActiveTab('to'); // Auto-avanzar interactivo
    } else {
      const hours = tempDateTo ? tempDateTo.getHours() : 23;
      const minutes = tempDateTo ? tempDateTo.getMinutes() : 59;
      clickedDate.setHours(hours, minutes, 59, 999);
      setTempDateTo(clickedDate);
    }
  };

  const safeActiveDate = getSafeDate(activeTab === 'from' ? tempDateFrom : tempDateTo);
  const currentHours = safeActiveDate ? safeActiveDate.getHours() : (activeTab === 'from' ? 0 : 23);
  const currentMinutes = safeActiveDate ? safeActiveDate.getMinutes() : (activeTab === 'from' ? 0 : 59);

  const handleTimeChange = (hours: number, minutes: number) => {
    if (activeTab === 'from') {
      const safeFrom = getSafeDate(tempDateFrom);
      const base = safeFrom ? new Date(safeFrom) : new Date();
      base.setHours(hours, minutes, 0, 0);
      setTempDateFrom(base);
    } else {
      const safeTo = getSafeDate(tempDateTo);
      const base = safeTo ? new Date(safeTo) : new Date();
      base.setHours(hours, minutes, 59, 999);
      setTempDateTo(base);
    }
  };

  const incrementHours = () => {
    const nextH = (currentHours + 1) % 24;
    handleTimeChange(nextH, currentMinutes);
  };

  const decrementHours = () => {
    const prevH = (currentHours - 1 + 24) % 24;
    handleTimeChange(prevH, currentMinutes);
  };

  const incrementMinutes = () => {
    const nextM = (currentMinutes + 1) % 60;
    handleTimeChange(currentHours, nextM);
  };

  const decrementMinutes = () => {
    const prevM = (currentMinutes - 1 + 60) % 60;
    handleTimeChange(currentHours, prevM);
  };

  const formatDateShort = (d: any) => {
    const safeD = getSafeDate(d);
    if (!safeD) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(safeD.getDate())}/${pad(safeD.getMonth() + 1)} ${pad(safeD.getHours())}:${pad(safeD.getMinutes())}`;
  };

  const activeDateLabel = React.useMemo(() => {
    const safeFrom = getSafeDate(filters.dateFrom);
    const safeTo = getSafeDate(filters.dateTo);
    if (!safeFrom && !safeTo) {
      return 'Todo el tiempo';
    }
    
    const formatDateShortLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${day}/${month} ${hours}:${mins}`;
    };

    const fromStr = safeFrom ? formatDateShortLocal(safeFrom) : 'Inicio';
    const toStr = safeTo ? formatDateShortLocal(safeTo) : 'Ahora';
    return `${fromStr} - ${toStr}`;
  }, [filters.dateFrom, filters.dateTo]);

  return (
    <div className="date-picker-dropdown-wrapper" ref={datePickerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`date-picker-trigger-btn ${filters.dateFrom || filters.dateTo ? 'active' : ''}`}
        onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
      >
        <div className="trigger-btn-content">
          <span className="material-icons-round">calendar_month</span>
          <span className="trigger-btn-label">Rango de tiempo:</span>
          <strong className="trigger-btn-value">{activeDateLabel}</strong>
        </div>
        
        <div className="trigger-btn-actions">
          {(filters.dateFrom || filters.dateTo) && (
            <span
              className="material-icons-round clear-date-trigger-icon"
              title="Restablecer todo el tiempo"
              onClick={(e) => {
                e.stopPropagation();
                setFilters(p => ({ ...p, dateFrom: null, dateTo: null }));
                setCurrentPage(1);
              }}
            >
              cancel
            </span>
          )}
          <span className="material-icons-round expand-arrow-icon">
            {isDatePickerOpen ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </button>

      {/* Glassmorphic Dropdown Popover */}
      {isDatePickerOpen && (
        <div className="date-picker-popover">
          <div className="date-picker-popover-body">
            {/* Presets Column */}
            <div className="popover-column presets-column">
              <span className="popover-section-title">Preajustes</span>
              <div className="preset-buttons-grid">
                <button
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => {
                    applyTimePreset(15);
                    setIsDatePickerOpen(false);
                  }}
                >
                  Últimos 15 minutos
                </button>
                <button
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => {
                    applyTimePreset(60);
                    setIsDatePickerOpen(false);
                  }}
                >
                  Última hora
                </button>
                <button
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => {
                    applyTimePreset(1440);
                    setIsDatePickerOpen(false);
                  }}
                >
                  Últimas 24 horas
                </button>
                <button
                  type="button"
                  className="preset-pill-btn preset-full-pill"
                  onClick={() => {
                    applyFullDateRange();
                    setIsDatePickerOpen(false);
                  }}
                >
                  Rango Completo
                </button>
              </div>
            </div>
            {/* Custom Range Column */}
            <div className="popover-column custom-range-column">
              <span className="popover-section-title">Rango Personalizado</span>
              
              {/* Pestañas de selección de Extremo del Rango */}
              <div className="calendar-tabs">
                <button
                  type="button"
                  className={`calendar-tab-btn ${activeTab === 'from' ? 'active' : ''}`}
                  onClick={() => setActiveTab('from')}
                >
                  <span className="tab-label">Desde:</span>
                  <span className="tab-value">
                    {tempDateFrom ? formatDateShort(tempDateFrom) : 'Inicio'}
                  </span>
                </button>
                <button
                  type="button"
                  className={`calendar-tab-btn ${activeTab === 'to' ? 'active' : ''}`}
                  onClick={() => setActiveTab('to')}
                >
                  <span className="tab-label">Hasta:</span>
                  <span className="tab-value">
                    {tempDateTo ? formatDateShort(tempDateTo) : 'Ahora'}
                  </span>
                </button>
              </div>

              {/* Widget del Calendario Widget */}
              <div className="custom-calendar-widget">
                <div className="calendar-header">
                  <button type="button" className="calendar-nav-btn" onClick={prevMonth}>
                    <span className="material-icons-round">chevron_left</span>
                  </button>
                  <span className="calendar-month-title">{MONTH_NAMES[month]} {year}</span>
                  <button type="button" className="calendar-nav-btn" onClick={nextMonth}>
                    <span className="material-icons-round">chevron_right</span>
                  </button>
                </div>

                <div className="calendar-weekdays">
                  {WEEKDAY_NAMES.map(w => (
                    <span key={w} className="weekday-cell">{w}</span>
                  ))}
                </div>

                <div className="calendar-days-grid">
                  {daysArray.map((d, index) => {
                    const cellDate = new Date(d.year, d.month, d.day);

                    const safeTempFrom = getSafeDate(tempDateFrom);
                    const safeTempTo = getSafeDate(tempDateTo);

                    const isSelectedFrom = safeTempFrom && 
                      safeTempFrom.getDate() === d.day && 
                      safeTempFrom.getMonth() === d.month && 
                      safeTempFrom.getFullYear() === d.year;

                    const isSelectedTo = safeTempTo && 
                      safeTempTo.getDate() === d.day && 
                      safeTempTo.getMonth() === d.month && 
                      safeTempTo.getFullYear() === d.year;

                    const isInRange = safeTempFrom && safeTempTo && 
                      cellDate >= new Date(safeTempFrom.getFullYear(), safeTempFrom.getMonth(), safeTempFrom.getDate()) && 
                      cellDate <= new Date(safeTempTo.getFullYear(), safeTempTo.getMonth(), safeTempTo.getDate());

                    const isToday = (() => {
                      const today = new Date();
                      return today.getDate() === d.day && today.getMonth() === d.month && today.getFullYear() === d.year;
                    })();

                    const hasLogsInDay = (() => {
                      const minDate = getSafeDate(logDateRange.min);
                      const maxDate = getSafeDate(logDateRange.max);
                      if (!minDate || !maxDate) return false;
                      const minDay = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
                      const maxDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
                      return cellDate >= minDay && cellDate <= maxDay;
                    })();

                    const classes = ['day-cell'];
                    if (!d.isCurrentMonth) classes.push('day-outside');
                    if (isSelectedFrom) classes.push('day-selected-from');
                    if (isSelectedTo) classes.push('day-selected-to');
                    if (isInRange) classes.push('day-in-range');
                    if (isToday) classes.push('day-today');
                    if (hasLogsInDay) classes.push('day-has-logs');

                    return (
                      <button
                        key={index}
                        type="button"
                        className={classes.join(' ')}
                        onClick={() => handleDayClick(d)}
                        title={hasLogsInDay ? "Este día contiene logs de transacciones" : undefined}
                      >
                        <span className="day-number">{d.day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selector Digital de Tiempo (Hora y Minuto) */}
              <div className="custom-time-widget">
                <span className="time-picker-label">
                  Hora {activeTab === 'from' ? 'Inicio' : 'Fin'}:
                </span>
                <div className="digital-clock-container">
                  <div className="digital-clock-unit">
                    <button type="button" className="time-arrow-btn" onClick={incrementHours}>
                      <span className="material-icons-round">expand_less</span>
                    </button>
                    <input
                      type="text"
                      className="digital-clock-input"
                      value={String(currentHours).padStart(2, '0')}
                      onChange={e => {
                        const val = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
                        handleTimeChange(val, currentMinutes);
                      }}
                      maxLength={2}
                    />
                    <button type="button" className="time-arrow-btn" onClick={decrementHours}>
                      <span className="material-icons-round">expand_more</span>
                    </button>
                  </div>

                  <span className="digital-clock-divider">:</span>

                  <div className="digital-clock-unit">
                    <button type="button" className="time-arrow-btn" onClick={incrementMinutes}>
                      <span className="material-icons-round">expand_less</span>
                    </button>
                    <input
                      type="text"
                      className="digital-clock-input"
                      value={String(currentMinutes).padStart(2, '0')}
                      onChange={e => {
                        const val = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                        handleTimeChange(currentHours, val);
                      }}
                      maxLength={2}
                    />
                    <button type="button" className="time-arrow-btn" onClick={decrementMinutes}>
                      <span className="material-icons-round">expand_more</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de acción del Popover */}
              <div className="calendar-actions-row">
                <button
                  type="button"
                  className="clear-custom-range-btn"
                  onClick={() => {
                    setTempDateFrom(null);
                    setTempDateTo(null);
                  }}
                >
                  <span className="material-icons-round" style={{ fontSize: '14px' }}>backspace</span>
                  Limpiar Rango
                </button>
                
                <button
                  type="button"
                  className="apply-custom-range-btn"
                  onClick={() => {
                    setFilters(p => ({ ...p, dateFrom: tempDateFrom, dateTo: tempDateTo }));
                    setCurrentPage(1);
                    setIsDatePickerOpen(false);
                  }}
                >
                  <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {/* Footer Timespan Info */}
          {logDateRange.minStr && (
            <div className="date-picker-popover-footer">
              <span className="material-icons-round">info</span>
              <span>
                Rango de logs cargados: <strong>{logDateRange.minStr}</strong> a <strong>{logDateRange.maxStr}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
