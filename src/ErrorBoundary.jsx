import React from 'react';
import RuntimeErrorScreen from './RuntimeErrorScreen.jsx';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    // Keep stack traces in devtools for root-cause debugging.
    console.error('[FilmLab] Runtime crash captured by ErrorBoundary', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <RuntimeErrorScreen message={this.state.message} />;
    }

    return this.props.children;
  }
}
