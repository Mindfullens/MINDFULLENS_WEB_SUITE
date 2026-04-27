export const PANEL_TABS = [
  { id: 'basic', label: 'Tonalność' },
  { id: 'color', label: 'Kolor' },
  { id: 'detail', label: 'Detal' },
  { id: 'effects', label: 'Efekty' },
  { id: 'kino', label: 'Kino' },
  { id: 'crop', label: 'Crop' },
  { id: 'history', label: 'Cała historia' },
];

export const GRADE_ZONES = [
  { id: 'shadows', label: 'Cienie' },
  { id: 'midtones', label: 'Półtony' },
  { id: 'highlights', label: 'Światła' },
  { id: 'global', label: 'Global' },
];

export function resolveInitialPanelFromLocation() {
  if (typeof window === 'undefined') {
    return 'basic';
  }

  const panelParam = new URLSearchParams(window.location.search).get('panel');
  if (panelParam && PANEL_TABS.some((tab) => tab.id === panelParam)) {
    return panelParam;
  }

  return 'basic';
}
