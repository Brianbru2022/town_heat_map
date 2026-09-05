import { lazy, Suspense, useEffect } from 'react';
import { useExplorerStore, type AppMode } from './app/store';

const loadExplorerView = () => import('./components/ExplorerView');
const loadInformationPage = () => import('./components/InformationPage');
const ExplorerView = lazy(() =>
  loadExplorerView().then((module) => ({ default: module.ExplorerView })),
);
const InformationPage = lazy(() =>
  loadInformationPage().then((module) => ({ default: module.InformationPage })),
);

const nav: { id: AppMode; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'sources', label: 'Sources & licences' },
  { id: 'methodology', label: 'Methodology' },
];

function preloadMode(mode: AppMode): void {
  if (mode === 'explore') void loadExplorerView();
  else void loadInformationPage();
}

export default function App() {
  const mode = useExplorerStore((state) => state.mode);
  const setMode = useExplorerStore((state) => state.setMode);
  const initialise = useExplorerStore((state) => state.initialise);
  const syncLocation = useExplorerStore((state) => state.syncLocation);

  useEffect(() => {
    void initialise();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [initialise, syncLocation]);

  return (
    <div className="app">
      <header>
        <a className="skip-link" href="#main-content">
          Skip to town guide
        </a>
        <button className="brand-home" onClick={() => setMode('explore')}>
          Historic Town Explorer
        </button>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              className={mode === item.id ? 'active' : ''}
              key={item.id}
              onMouseEnter={() => preloadMode(item.id)}
              onFocus={() => preloadMode(item.id)}
              onClick={() => setMode(item.id)}
              aria-current={mode === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <Suspense
        fallback={
          <main className="info" aria-live="polite">
            <article className="card">Loading view…</article>
          </main>
        }
      >
        {mode === 'explore' ? <ExplorerView /> : <InformationPage />}
      </Suspense>
    </div>
  );
}
