import { useMemo } from 'react';
import FilmLabShell from './FilmLabShell.jsx';
import { buildFilmLabShellPropBundle } from './filmLab/buildFilmLabShellPropBundle.js';
import {
  studioWorkspaceTabsFromTranslator,
  translateCategoryTabs,
  translateCropAspectPresets,
  translateCropOverlayModes,
  translateGradeZones,
  translateMetadataViewModeLabels,
  translateMixerColors,
  translateMixerGroups,
  translatePanelTabs,
  useI18n,
} from './i18n';

export default function FilmLabShellContainer({ shellRef, viewMode, isPreviewFullMode, bundleArgs }) {
  const { t } = useI18n();
  const {
    studioWorkspace,
    studioNavProps,
    libraryWorkspaceProps,
    sourceFileInputProps,
    developFilmstripProps,
    toolbarProps,
    profilesSidebarProps,
    canvasAreaProps,
    rightPanelProps,
    shortcutHelpProps,
    sessionRestorePromptProps,
    exportModalProps,
    bottomStatusBarProps,
  } = useMemo(() => {
    const raw = buildFilmLabShellPropBundle(bundleArgs);
    const { developFilmstripProps, ...shellRest } = raw;
    return {
      ...shellRest,
      developFilmstripProps,
      studioNavProps: {
        ...raw.studioNavProps,
        tabs: studioWorkspaceTabsFromTranslator(t),
      },
      profilesSidebarProps: {
        ...raw.profilesSidebarProps,
        categoryTabs: translateCategoryTabs(t),
      },
      canvasAreaProps: {
        ...raw.canvasAreaProps,
        metadataViewModeLabels: translateMetadataViewModeLabels(t),
      },
      rightPanelProps: {
        ...raw.rightPanelProps,
        panelTabs: translatePanelTabs(t),
        gradeZones: translateGradeZones(t),
        mixerGroups: translateMixerGroups(t),
        mixerColors: translateMixerColors(t),
        cropAspectPresets: translateCropAspectPresets(t),
        cropOverlayModes: translateCropOverlayModes(t),
      },
    };
  }, [bundleArgs, t]);

  return (
    <FilmLabShell
      shellRef={shellRef}
      viewMode={viewMode}
      isPreviewFullMode={isPreviewFullMode}
      studioWorkspace={studioWorkspace}
      studioNavProps={studioNavProps}
      libraryWorkspaceProps={libraryWorkspaceProps}
      developFilmstripProps={developFilmstripProps}
      sourceFileInputProps={sourceFileInputProps}
      toolbarProps={toolbarProps}
      profilesSidebarProps={profilesSidebarProps}
      canvasAreaProps={canvasAreaProps}
      rightPanelProps={rightPanelProps}
      shortcutHelpProps={shortcutHelpProps}
      sessionRestorePromptProps={sessionRestorePromptProps}
      exportModalProps={exportModalProps}
      bottomStatusBarProps={bottomStatusBarProps}
    />
  );
}
