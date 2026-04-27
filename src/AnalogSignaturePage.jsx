import StaticHtmlPage from './StaticHtmlPage';
import analogSignatureHtml from './analogSignaturePage.html?raw';

export default function AnalogSignaturePage() {
  return (
    <StaticHtmlPage
      html={analogSignatureHtml}
      idPrefix="analog-signature"
      hostClassName="analog-signature-page-host"
    />
  );
}
