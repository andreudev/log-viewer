import React, { useState, useEffect, useRef } from 'react';

interface AnnotationPopoverProps {
  initialText: string;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
  position: { x: number; y: number };
  logId: number;
}

export const AnnotationPopover: React.FC<AnnotationPopoverProps> = ({
  initialText,
  onSave,
  onDelete,
  onClose,
  position,
  logId
}) => {
  const [text, setText] = useState(initialText);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when pressing Escape or clicking outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Adjust coordinates if it overflows the boundaries of the screen viewport
  const [coords, setCoords] = useState(position);

  useEffect(() => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    let newX = position.x;
    let newY = position.y;

    // Check right screen boundary overflow
    if (position.x + rect.width > window.innerWidth) {
      newX = window.innerWidth - rect.width - 20;
    }
    // Check bottom screen boundary overflow
    if (position.y + rect.height > window.innerHeight) {
      newY = window.innerHeight - rect.height - 20;
    }

    setCoords({ x: Math.max(16, newX), y: Math.max(16, newY) });
  }, [position]);

  return (
    <div
      ref={popoverRef}
      className="annotation-popover glass-card"
      style={{
        top: `${coords.y}px`,
        left: `${coords.x}px`
      }}
    >
      <h4>
        <span className="material-icons-round" style={{ fontSize: '14px', color: '#e5c07b' }}>note_alt</span>
        Anotación (Log #{logId})
      </h4>
      
      <textarea
        className="annotation-textarea"
        placeholder="Escribe un comentario o hallazgo QA..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      
      <div className="annotation-actions">
        {initialText && (
          <button
            type="button"
            className="annotation-btn annotation-btn-delete"
            onClick={onDelete}
            title="Borrar anotación"
          >
            <span className="material-icons-round">delete</span>
            Borrar
          </button>
        )}
        
        <button
          type="button"
          className="annotation-btn annotation-btn-cancel"
          onClick={onClose}
        >
          Cancelar
        </button>

        <button
          type="button"
          className="annotation-btn annotation-btn-save"
          onClick={() => onSave(text.trim())}
          title="Guardar comentario"
          disabled={!text.trim() && !initialText}
        >
          <span className="material-icons-round">save</span>
          Guardar
        </button>
      </div>
    </div>
  );
};
