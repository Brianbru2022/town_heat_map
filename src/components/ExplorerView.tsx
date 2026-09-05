import { useExplorerStore } from '../app/store';
import { FeatureDetails } from './FeatureDetails';
import { Sidebar } from './Sidebar';
import { Timeline } from './Timeline';
import { MapCanvas } from '../map/MapCanvas';

export function ExplorerView() {
  const projectPackage = useExplorerStore((state) => state.package);
  const loadStatus = useExplorerStore((state) => state.loadStatus);
  const loadError = useExplorerStore((state) => state.loadError);
  const retryLoad = useExplorerStore((state) => state.retryLoad);

  if (!projectPackage) {
    return (
      <main className="info" aria-live="polite">
        <article className="card">
          <h1>{loadStatus === 'error' ? 'Town guide unavailable' : 'Loading town guide…'}</h1>
          {loadError && <p>{loadError}</p>}
          {loadStatus === 'error' && (
            <button type="button" onClick={() => void retryLoad()}>
              Try again
            </button>
          )}
        </article>
      </main>
    );
  }

  return (
    <main className="explorer" id="main-content" aria-labelledby="explorer-heading">
      <Sidebar />
      <MapCanvas />
      <FeatureDetails />
      <Timeline />
    </main>
  );
}
