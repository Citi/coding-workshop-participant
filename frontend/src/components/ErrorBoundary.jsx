import { Component } from 'react';
import PropTypes from 'prop-types';
import ErrorState from './ErrorState.jsx';

/**
 * Catches rendering errors in a page so one broken page does not blank the whole app.
 * AppShell keys it by route, so navigating away clears the error.
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
   * Clear the error and render the children again.
   * @returns {void}
   */
  handleRetry() {
    this.setState({ error: null });
  }

  /**
   * @returns {import('react').ReactNode} The children, or the fallback after an error.
   */
  render() {
    const { error } = this.state;
    const { children } = this.props;
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
