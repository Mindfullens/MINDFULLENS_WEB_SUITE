import { useI18n, studioWorkspaceTabsFromTranslator } from './i18n';

export default function FilmLabWorkspacePlaceholder({ workspaceId }) {
  const { t } = useI18n();
  const tabs = studioWorkspaceTabsFromTranslator(t);
  const tab = tabs.find((item) => item.id === workspaceId);
  const title = tab?.label ?? workspaceId;

  return (
    <section className="film-lab-workspace-placeholder" aria-label={title}>
      <div className="film-lab-workspace-placeholder-inner">
        <h2 className="film-lab-workspace-placeholder-title">{title}</h2>
        <p className="film-lab-workspace-placeholder-copy">
          {t('workspace.placeholder.line1')}{' '}
          <strong>{t('filmLab.studio.develop.label')}</strong>
          {t('workspace.placeholder.or')}
          <strong>{t('filmLab.studio.masks.label')}</strong>
          {t('workspace.placeholder.lineEnd')}
        </p>
      </div>
    </section>
  );
}
