import { useEffect, useMemo, useState } from 'react';
import { useExplorerStore, useLoadedProjectPackage } from '../app/store';
import {
  buildReviewQueue,
  type LocalReviewDecision,
  type LocalReviewStatus,
  type ReviewFilter,
} from '../domain/review';
import { dateWording } from '../domain/timeline';
import { canonicalPublicUrl } from '../domain/publicUrl';

const filters: Array<{ value: ReviewFilter; label: string }> = [
  { value: 'all', label: 'All open review items' },
  { value: 'publication', label: 'Publication blockers / provisional' },
  { value: 'date', label: 'Date evidence needed' },
  { value: 'location', label: 'Location / geometry check' },
  { value: 'unreviewed', label: 'Not curator-reviewed' },
  { value: 'validation', label: 'Validation warnings' },
];

const storageKey = (projectId: string) => `historic-town-explorer:review-decisions:${projectId}`;

function loadDecisions(projectId: string): Record<string, LocalReviewDecision> {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    const parsed = raw ? (JSON.parse(raw) as LocalReviewDecision[]) : [];
    return Object.fromEntries(parsed.map((decision) => [decision.featureId, decision]));
  } catch {
    return {};
  }
}

function statusLabel(status?: LocalReviewStatus): string {
  if (status === 'approved') return 'Locally approved';
  if (status === 'excluded') return 'Excluded from local queue';
  return 'Needs research';
}

export function CurationReview() {
  const pkg = useLoadedProjectPackage();
  const selectFeature = useExplorerStore((state) => state.selectFeature);
  const setMode = useExplorerStore((state) => state.setMode);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [includeResolved, setIncludeResolved] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [decisions, setDecisions] = useState<Record<string, LocalReviewDecision>>(() =>
    loadDecisions(pkg.project.id),
  );
  const [note, setNote] = useState('');

  useEffect(() => {
    setDecisions(loadDecisions(pkg.project.id));
    setSelectedId(undefined);
    setNote('');
  }, [pkg.project.id]);

  const queue = useMemo(() => buildReviewQueue(pkg, filter), [pkg, filter]);
  const visibleQueue = includeResolved
    ? queue
    : queue.filter((item) => {
        const status = decisions[item.feature.id]?.status;
        return status !== 'excluded' && status !== 'approved';
      });
  const selected = visibleQueue.find((item) => item.feature.id === selectedId) ?? visibleQueue[0];

  useEffect(() => {
    if (selected && selected.feature.id !== selectedId) {
      setSelectedId(selected.feature.id);
      setNote(decisions[selected.feature.id]?.note ?? '');
    }
  }, [decisions, selected, selectedId]);

  const persist = (featureId: string, status: LocalReviewStatus) => {
    const next = {
      ...decisions,
      [featureId]: {
        featureId,
        status,
        note: note.trim() || undefined,
        updatedAt: new Date().toISOString(),
      },
    };
    setDecisions(next);
    window.localStorage.setItem(storageKey(pkg.project.id), JSON.stringify(Object.values(next)));
  };

  const download = () => {
    const payload = {
      projectId: pkg.project.id,
      projectName: pkg.project.name,
      exportedAt: new Date().toISOString(),
      decisions: Object.values(decisions).sort((left, right) =>
        left.featureId.localeCompare(right.featureId),
      ),
    };
    const href = URL.createObjectURL(
      new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = href;
    link.download = `${pkg.project.id}-local-review-decisions.json`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const goToFeature = () => {
    if (!selected) return;
    selectFeature(selected.feature);
    setMode('explore');
  };
  const undatedReviewUrl = canonicalPublicUrl(
    `/api/projects/${encodeURIComponent(pkg.project.id)}/exports/undated-heritage-review.csv`,
    { allowSameOrigin: true },
  );

  return (
    <main className="info curation-review">
      <h1>Curator review</h1>
      <p>
        Triage source-backed date and location checks for {pkg.project.name}. Local decisions stay
        in this browser until you download and apply them through the curation workflow.
      </p>
      {pkg.publicationSummary &&
        pkg.publicationSummary.totalRecords > pkg.publicationSummary.publishable && (
          <p className="notice">
            Public delivery includes {pkg.publicationSummary.publishable} of{' '}
            {pkg.publicationSummary.totalRecords} retained records. Review the repository
            publication audit for provisional, withheld, and blocked record IDs; those records are
            not exposed by the public API.
          </p>
        )}
      <article className="card review-controls">
        <label>
          Review queue
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ReviewFilter)}
          >
            {filters.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          Show locally resolved records
        </label>
        <button type="button" onClick={download} disabled={!Object.keys(decisions).length}>
          Download local decisions
        </button>
        {undatedReviewUrl && (
          <a href={undatedReviewUrl} download>
            Download undated heritage CSV
          </a>
        )}
      </article>
      <div className="review-workspace">
        <article className="card review-queue" aria-label="Review records">
          <h2>{visibleQueue.length} record(s) to review</h2>
          {visibleQueue.length ? (
            <ul className="review-record-list">
              {visibleQueue.map((item) => {
                const decision = decisions[item.feature.id];
                return (
                  <li key={item.feature.id}>
                    <button
                      className={selected?.feature.id === item.feature.id ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setSelectedId(item.feature.id);
                        setNote(decision?.note ?? '');
                      }}
                    >
                      <strong>{item.feature.name}</strong>
                      <small>{statusLabel(decision?.status)}</small>
                      <span>{item.reasons[0]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No records match this local review filter.</p>
          )}
        </article>
        <article className="card review-detail">
          {selected ? (
            <>
              <p className="eyebrow">{selected.feature.featureType}</p>
              <h2>{selected.feature.name}</h2>
              <p className="date">
                <span>Current historic date</span>
                {dateWording(selected.feature)}
              </p>
              <dl className="review-summary">
                <dt>Date basis</dt>
                <dd>{selected.feature.dateBasis.replaceAll('_', ' ')}</dd>
                <dt>Location</dt>
                <dd>
                  {selected.feature.locationType.replaceAll('_', ' ')} (
                  {selected.feature.locationConfidence})
                </dd>
                <dt>Published review status</dt>
                <dd>{selected.feature.reviewed ? 'Reviewed' : 'Unreviewed'}</dd>
                <dt>Effective publication state</dt>
                <dd>{selected.publication.effectiveState.replaceAll('_', ' ')}</dd>
              </dl>
              <h3>Why this is in the queue</h3>
              <ul className="review-list">
                {selected.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <h3>Source evidence</h3>
              {selected.feature.sourceRecords.length ? (
                selected.feature.sourceRecords.map((source) => (
                  <p className="source" key={`${source.sourceName}-${source.sourceRecordId ?? ''}`}>
                    <strong>{source.sourceOrganisation}</strong>
                    <br />
                    {canonicalPublicUrl(source.sourceUrl) ? (
                      <a
                        href={canonicalPublicUrl(source.sourceUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.sourceName}
                      </a>
                    ) : (
                      source.sourceName
                    )}
                    {source.quotedDateText && (
                      <>
                        <br />
                        {source.quotedDateText}
                      </>
                    )}
                  </p>
                ))
              ) : (
                <p>No source record has been attached yet.</p>
              )}
              <label>
                Local review note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record the source checked, decision, and any follow-up needed."
                  rows={4}
                />
              </label>
              <div className="review-actions">
                <button
                  type="button"
                  onClick={() => persist(selected.feature.id, 'needs_research')}
                >
                  Save research note
                </button>
                <button type="button" onClick={() => persist(selected.feature.id, 'approved')}>
                  Mark locally approved
                </button>
                <button type="button" onClick={() => persist(selected.feature.id, 'excluded')}>
                  Exclude from local queue
                </button>
                <button type="button" onClick={goToFeature}>
                  Inspect on map
                </button>
              </div>
              <p className="notice">
                These controls do not publish edits. Verify the cited evidence, then apply approved
                changes to the repository-backed data pack.
              </p>
            </>
          ) : (
            <p>Select a record to review its source evidence.</p>
          )}
        </article>
      </div>
    </main>
  );
}
