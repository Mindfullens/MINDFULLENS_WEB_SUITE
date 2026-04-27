export function isTextEditingTarget(target) {
  if (!target) {
    return false;
  }

  if (target instanceof HTMLTextAreaElement || target?.isContentEditable) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    const type = String(target.type || 'text').toLowerCase();
    return ![
      'range',
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'file',
      'color',
    ].includes(type);
  }

  return target instanceof HTMLSelectElement;
}
