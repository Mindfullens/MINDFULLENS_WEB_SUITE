import { useI18n } from './i18n';

export default function FilmLabStudioNav({ tabs, activeId, onChange }) {
  const { t } = useI18n();
  return (
    <nav className="film-lab-studio-nav" aria-label={t('filmLab.studioNav.ariaLabel')}>
      <div className="film-lab-studio-nav-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`film-lab-studio-tab${activeId === tab.id ? ' active' : ''}`}
            onClick={() => onChange(tab.id)}
            title={tab.label}
          >
            <span className="film-lab-studio-tab-full">{tab.label}</span>
            <span className="film-lab-studio-tab-short" aria-hidden>
              {tab.shortLabel}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
