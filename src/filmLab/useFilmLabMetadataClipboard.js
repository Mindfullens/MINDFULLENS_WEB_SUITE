import { useCallback, useState } from 'react';

export function useFilmLabMetadataClipboard({ metadataItems }) {
  const [metadataFeedback, setMetadataFeedback] = useState(null);

  const copyMetadataToClipboard = useCallback(async () => {
    const payload = metadataItems
      .map((item) => `${item.label}: ${item.value}`)
      .join('\n');

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setMetadataFeedback('copied');
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = payload;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setMetadataFeedback('copied');
      } catch {
        setMetadataFeedback('failed');
      }
    }

    setTimeout(() => {
      setMetadataFeedback(null);
    }, 1500);
  }, [metadataItems]);

  return {
    metadataFeedback,
    copyMetadataToClipboard,
  };
}
