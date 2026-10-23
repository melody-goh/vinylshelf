import type { User } from '@vinylshelf/contract';
import { useLogout } from '../api/session';

export function Shelf({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{user.discogsUsername}&rsquo;s shelf</h1>
        <button
          type="button"
          onClick={() => {
            logout.mutate();
          }}
          disabled={logout.isPending}
          className="text-sm underline"
        >
          Sign out
        </button>
      </header>
    </section>
  );
}
