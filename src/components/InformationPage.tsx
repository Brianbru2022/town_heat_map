import { lazy, Suspense } from 'react';
import { useExplorerStore } from '../app/store';

const CurationReview = lazy(() =>
  import('./CurationReview').then((module) => ({ default: module.CurationReview })),
);

export function InformationPage() {
  const mode = useExplorerStore((state) => state.mode);
  const pkg = useExplorerStore((state) => state.package);
  const loadStatus = useExplorerStore((state) => state.loadStatus);
  const loadError = useExplorerStore((state) => state.loadError);
  const retryLoad = useExplorerStore((state) => state.retryLoad);
  if (mode === 'explore') return null;
  if (!pkg) {
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
  if (mode === 'data-review') {
    return (
      <Suspense
        fallback={
          <main className="info" aria-live="polite">
            Loading curator review…
          </main>
        }
      >
        <CurationReview />
      </Suspense>
    );
  }
  const title =
    mode === 'sources'
      ? 'Sources & licences'
      : mode === 'methodology'
        ? 'Methodology'
        : 'Data review';
  return (
    <main className="info">
      <h1>{title}</h1>
      {mode === 'sources' && (
        <>
          <article className="card">
            <h2>Listed-building register</h2>
            <p>
              Download the current HES statutory listed-building extract for the NRS town locality
              and its clearly labelled heritage-buffer review candidates.
            </p>
            <a
              href={`/api/projects/${encodeURIComponent(pkg.project.id)}/exports/listed-buildings.csv`}
              download
            >
              Download {pkg.project.locality} listed buildings (CSV)
            </a>
          </article>
          {pkg.sources.map((source) => (
            <article className="card" key={source.id}>
              <h2>{source.name}</h2>
              <p>
                <strong>{source.organisation}</strong> · {source.coverage}
              </p>
              <p>
                Access: {source.accessMethod} · Reliability:{' '}
                {source.reliability.replaceAll('_', ' ')}
              </p>
              {source.sourceUrl && (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Open source
                </a>
              )}
              <p>{source.limitations}</p>
            </article>
          ))}
        </>
      )}
      {mode === 'methodology' && (
        <article className="card">
          <h2>Historic-character heat map</h2>
          <p>
            This is an interpretive visualisation, not an official heritage assessment. Score = an
            age-emphasised factor × normalised significance × date confidence × surviving-character
            factor. Older evidence is stronger, but uncertain or poorly surviving sites do not
            dominate merely because they are old.
          </p>
          <p>
            Designation labels are normalised in country adapters, so the scoring engine does not
            assume a UK designation system.
          </p>
          <h2>Settlement age</h2>
          <p>
            Settlement-age evidence is represented as separately reviewed polygons with map/source
            references. It is never inferred from the heat map.
          </p>
          <p>
            {pkg.settlementPolygons.length} evidence area(s) are currently published. Their
            confidence, source records and digitisation method remain part of the data package; a
            low-confidence current-geometry corridor is not a complete historic settlement boundary.
          </p>
        </article>
      )}
    </main>
  );
}
