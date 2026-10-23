import { useMe } from './api/session';
import { Footer } from './components/Footer';
import { Login } from './screens/Login';
import { Shelf } from './screens/Shelf';

/**
 * No router yet: the session decides the screen. Signed out shows the login screen,
 * signed in shows the shelf (which handles importing and refreshing itself).
 */
export function App() {
  const me = useMe();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-900">
      <main>
        {me.isPending ? (
          <p role="status">Loading…</p>
        ) : me.isError ? (
          <p role="alert">The server could not be reached. Try again in a moment.</p>
        ) : me.data ? (
          <Shelf user={me.data} />
        ) : (
          <Login />
        )}
      </main>
      <Footer />
    </div>
  );
}
