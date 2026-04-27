const EXPORT_OPTIONS = [
  {
    id: 'social',
    icon: '📱',
    title: 'Social Media',
    desc: 'Zoptymalizowane pod Instagram (1080px). Maksymalna ostrość i profil sRGB.',
  },
  {
    id: 'web',
    icon: '💻',
    title: 'Galeria Web',
    desc: 'Standard 2048px. Idealny stosunek wagi do jakości na monitory i tablety.',
  },
  {
    id: 'full',
    icon: '🖼️',
    title: 'Pełna Jakość',
    desc: 'Oryginalna rozdzielczość. Najlepsza do archiwizacji i druku wielkoformatowego.',
  },
];

export default function FilmLabExportModal({
  open,
  pendingBatchFiles,
  onClose,
  processBatch,
  exportImage,
}) {
  if (!open) {
    return null;
  }

  const handleBackdropClick = () => {
    onClose();
  };

  const handleOption = (sizeProfile) => {
    if (pendingBatchFiles?.length) {
      processBatch(pendingBatchFiles, sizeProfile);
    } else {
      exportImage({ sizeProfile });
    }
    onClose();
  };

  return (
    <div className="export-modal-backdrop" onClick={handleBackdropClick}>
      <div className="export-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal-header">
          <h2>{pendingBatchFiles ? 'Grupowy Eksport Zdjęć' : 'Podaj Wielkość Eksportu'}</h2>
          <button type="button" className="export-modal-close" onClick={handleBackdropClick}>
            ✕
          </button>
        </div>

        <div className="export-options-grid">
          {EXPORT_OPTIONS.map((opt) => (
            <div key={opt.id} className="export-option-card" onClick={() => handleOption(opt.id)}>
              <div className="export-option-icon">{opt.icon}</div>
              <div className="export-option-title">{opt.title}</div>
              <div className="export-option-desc">{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
