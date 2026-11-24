import { Component } from 'react';
import PropTypes from 'prop-types';
import ErrorState from './ErrorState.jsx';
import { isChunkLoadError, reloadPage } from '../utils/lazyPage.js';

/**
 * Catches rendering errors in a page so one broken page does not blank the whole app.
 * AppShell keys it by route, so navigating away clears the error.
 *
 * A page whose code file failed to download (for example after a redeploy removed the old
 * files) gets a "Reload page" button instead of Retry: React.lazy caches the failed import,
 * so rendering again would fail the same way, while a reload fetches the current files.
 */
export default class ErrorBoundary extends Component {
  /**
   * @param {object} props - Component props.
   */
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  /**
   * Store the error so the fallback renders.
   * @param {Error} error - The thrown error.
   * @returns {{error: Error}} New state.
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /**
   * Log the error for debugging.
   * @param {Error} error - The thrown error.
   * @param {{componentStack?: string}} info - React's component stack.
   * @returns {void}
   */
  componentDidCatch(error, info) {
    console.error('Page failed to render', error, info?.componentStack);
  }

  /**
   * Recover: reload the app after a failed code download, otherwise clear the error and
   * render the children again.
   * @returns {void}
   */
  handleRetry() {
    if (isChunkLoadError(this.state.error)) {
      reloadPage();
      return;
    }
    this.setState({ error: null });
  }

  /**
   * @returns {import('react').ReactNode} The children, or the fallback after an error.
   */
  render() {
    const { error } = this.state;
    const { children } = this.props;
    if (error && isChunkLoadError(error)) {
      return (
        <ErrorState
          title="This page could not be loaded"
          error="The app may have been updated since this tab was opened, or the connection dropped. Reload to get the latest version."
          onRetry={this.handleRetry}
          retryLabel="Reload page"
        />
      );
    }
    if (error) {
      return (
        <ErrorState
          title="This page failed to load"
          error="Something went wrong while showing this page. Try again, or pick another page from the menu."
          onRetry={this.handleRetry}
        />
      );
    }
    return children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};
