import { Component, type ReactNode } from 'react';
import Button from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    // Production error reporting omitted — backend endpoint not implemented yet.
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary" className="min-h-screen bg-(--surface-page) flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <h2 className="typo-h2 text-(--text-primary) mb-2">
              Something went wrong
            </h2>
            <p className="typo-body text-(--text-secondary) mb-6">
              An unexpected error occurred. Please try again.
            </p>
            <Button variant="primary" data-testid="error-boundary-retry-btn" onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
