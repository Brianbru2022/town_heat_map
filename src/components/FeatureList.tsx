import { useExplorerStore } from '../app/store';
import type { PublicFeature } from '../domain/publicDto';
import { dateWording } from '../domain/timeline';

function isCurrentPlace(feature: PublicFeature): boolean {
  return (
    feature.publication?.profile === 'mapped_context' ||
    feature.publication?.profile === 'verified_facility'
  );
}

function matchesQuery(feature: PublicFeature, query: string): boolean {
  const value = query.trim().toLocaleLowerCase();
  if (!value) return true;
  return `${feature.name} ${feature.alternativeNames.join(' ')} ${feature.featureType} ${feature.tags.join(' ')}`
    .toLocaleLowerCase()
    .includes(value);
}

function listable(feature: PublicFeature): boolean {
  return feature.evidenceScope !== 'out_of_scope' && !feature.tags.includes('map-hidden');
}

function FeatureButton({ feature, current }: { feature: PublicFeature; current: boolean }) {
  const selected = useExplorerStore((state) => state.selectedFeature?.id === feature.id);
  const select = useExplorerStore((state) => state.selectFeature);
  const summary = current
    ? 'Current mapped place'
    : `${feature.featureType.replaceAll('_', ' ')} · ${dateWording(feature)}`;
  return (
    <button
      className="feature-row"
      type="button"
      data-feature-id={feature.id}
      aria-pressed={selected}
      onClick={() => select(feature)}
    >
      <strong>{feature.name}</strong>
      <small>{summary}</small>
    </button>
  );
}

export function FeatureList() {
  const pkg = useExplorerStore((state) => state.package);
  const query = useExplorerStore((state) => state.query);
  if (!pkg) return null;

  const features = pkg.features
    .filter((feature) => listable(feature) && matchesQuery(feature, query))
    .sort((left, right) => left.name.localeCompare(right.name));
  const historic = features.filter((feature) => !isCurrentPlace(feature));
  const current = features.filter(isCurrentPlace);
  const limitedHistoric = historic.slice(0, 24);
  const limitedCurrent = current.slice(0, 16);
  const hidden = historic.length - limitedHistoric.length + current.length - limitedCurrent.length;

  return (
    <section className="feature-list" aria-labelledby="places-heading">
      <h2 id="places-heading">Places in {pkg.project.locality}</h2>
      <p className="muted" id="places-description">
        Browse and open place details without using the map.
      </p>
      <p className="visually-hidden" role="status">
        {features.length} places match the current search.
      </p>
      {limitedHistoric.length > 0 && (
        <div>
          <h3 id="historic-places-heading">Historic places</h3>
          {limitedHistoric.map((feature) => (
            <FeatureButton feature={feature} key={feature.id} current={false} />
          ))}
        </div>
      )}
      {limitedCurrent.length > 0 && (
        <div>
          <h3 id="visitor-places-heading">Food and visitor facilities</h3>
          {limitedCurrent.map((feature) => (
            <FeatureButton feature={feature} key={feature.id} current />
          ))}
        </div>
      )}
      {features.length === 0 && <p className="muted">No places match this search.</p>}
      {hidden > 0 && (
        <p className="muted">Refine the search to browse the remaining {hidden} places.</p>
      )}
    </section>
  );
}
