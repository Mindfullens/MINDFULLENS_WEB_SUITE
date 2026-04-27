import StaticHtmlPage from './StaticHtmlPage';
import timeMachineHtml from './static-pages/timemachine.html?raw';

export default function TimeMachinePage() {
  return <StaticHtmlPage html={timeMachineHtml} idPrefix="timemachine" hostClassName="time-machine-page-host" />;
}
