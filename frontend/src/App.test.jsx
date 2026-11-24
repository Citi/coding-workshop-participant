import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App', () => {
  it('boots with theme, router, notifications and auth, showing sign-in when signed out', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(document.title).toBe('Sign in | ACME Project Intelligence');
  });
});
