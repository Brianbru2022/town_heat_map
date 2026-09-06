import { useEffect, useRef } from 'react';
import { dateWording } from '../domain/timeline';
import { useExplorerStore } from '../app/store';
import type { PublicCurrentPlaceClaim, PublicCurrentPlaceDetail } from '../domain/publicDto';
import { canonicalPublicUrl } from '../domain/publicUrl';

function safeExternalUrl(value?: string): string | undefined {
  return canonicalPublicUrl(value);
}

function currentPlaceClaimPresentation(
  claim: PublicCurrentPlaceClaim,
): [string, string] | undefined {
  switch (claim.kind) {
    case 'website':
      return undefined;
    case 'opening_hours':
      return ['Opening hours', claim.schedule];
    case 'accessibility':
      return ['Wheelchair access', claim.wheelchair];
    case 'fees':
      return ['Fees apply', claim.fee];
    case 'public_access':
      return ['Public access', claim.access];
    case 'capacity':
      return ['Capacity', String(claim.spaces)];
  }
}

function currentPlaceType(osmDetails: PublicCurrentPlaceDetail[], tags: string[]): string {
  const tag = (key: string) => osmDetails.find((detail) => detail.key === key)?.value;
  const amenity = tag('amenity');
  if (amenity === 'cafe') return 'Café';
  if (amenity === 'ice_cream') return 'Ice-cream shop';
  if (amenity === 'restaurant') return 'Restaurant';
  if (amenity === 'parking') return 'Parking';
  if (amenity === 'toilets') return 'Mapped toilets';
  if (amenity === 'drinking_water') return 'Drinking water';
  const category = tags.find(
    (item) => item.startsWith('osm-community-') && item !== 'osm-community-place',
  );
  return category?.replace('osm-community-', '').replaceAll('_', ' ') ?? 'Current place';
}

function presentedCurrentPlaceType(type: string, mappedContext: boolean): string {
  if (!mappedContext || type.startsWith('Mapped ')) return type;
  return `Mapped ${type.toLowerCase()}`;
}

export function FeatureDetails() {
  const detailsRef = useRef<HTMLElement>(null);
  const feature = useExplorerStore((state) => state.selectedFeature);
  const select = useExplorerStore((state) => state.selectFeature);
  useEffect(() => {
    if (!feature || !window.matchMedia('(max-width: 650px)').matches) return;
    const revealDetails = window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ block: 'start' });
      detailsRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(revealDetails);
  }, [feature]);
  if (!feature)
    return (
      <aside className="details empty" aria-labelledby="feature-details-heading">
        <h2 id="feature-details-heading">Feature details</h2>
        <p>Select a mapped historic feature to inspect its source-backed record.</p>
      </aside>
    );
  const selectedFeatureId = feature.id;
  const osmSource = feature.sourceRecords.find((source) =>
    /openstreetmap/i.test(`${source.sourceName} ${source.sourceOrganisation}`),
  );
  const currentDetails = feature.currentPlaceDetails ?? [];
  const currentOsmDetails = currentDetails;
  const currentClaims = feature.currentPlaceClaims ?? [];
  const osmWebsite = safeExternalUrl(currentClaims.find((claim) => claim.kind === 'website')?.url);
  const osmSourceUrl = safeExternalUrl(osmSource?.sourceUrl);
  const shownCurrentClaims = currentClaims.flatMap((claim) => {
    const presentation = currentPlaceClaimPresentation(claim);
    return presentation ? [presentation] : [];
  });
  const isCurrentPlace = Boolean(osmSource);
  const profile = feature.publication?.profile;
  const checkedAt = feature.osmCheckedAt ?? osmSource?.accessedAt;
  function closeDetails() {
    select(undefined);
    window.requestAnimationFrame(() =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('[data-feature-id]'))
        .find((button) => button.dataset.featureId === selectedFeatureId)
        ?.focus(),
    );
  }
  return (
    <aside
      ref={detailsRef}
      className="details"
      aria-labelledby="feature-details-heading"
      tabIndex={-1}
    >
      <button className="icon" type="button" onClick={closeDetails} aria-label="Close details">
        ×
      </button>
      <p className="eyebrow">{isCurrentPlace ? 'Current place' : feature.featureType}</p>
      <h2 id="feature-details-heading">{feature.name}</h2>
      {feature.evidenceScope === 'related_context' && (
        <p className="notice">
          Related context — excluded from parish statistics and heat scoring.
        </p>
      )}
      {isCurrentPlace ? (
        <dl className="current-place-meta">
          <dt>Place type</dt>
          <dd>
            {presentedCurrentPlaceType(
              currentPlaceType(currentOsmDetails, feature.tags),
              profile === 'mapped_context',
            )}
          </dd>
          <dt>Location</dt>
          <dd>
            {feature.locationType.replaceAll('_', ' ')} ({feature.locationConfidence})
          </dd>
          <dt>Information</dt>
          <dd>
            {profile === 'editorial'
              ? 'Editorial visitor information'
              : profile === 'verified_facility'
                ? 'Verified visitor information'
                : 'Mapped context'}
          </dd>
          {checkedAt && (
            <>
              <dt>Map record checked</dt>
              <dd>{new Date(checkedAt).toLocaleDateString()}</dd>
            </>
          )}
        </dl>
      ) : (
        <>
          <p className="date">
            <span>Historic date</span>
            {dateWording(feature)}
          </p>
          <dl>
            <dt>Designation</dt>
            <dd>{feature.designationCategory ?? feature.designationType ?? 'Not designated'}</dd>
            <dt>Date basis</dt>
            <dd>{feature.dateBasis.replaceAll('_', ' ')}</dd>
            <dt>Date confidence</dt>
            <dd>{feature.dateConfidence}</dd>
            {feature.datePrecision && (
              <>
                <dt>Date precision</dt>
                <dd>{feature.datePrecision.replaceAll('_', ' ')}</dd>
              </>
            )}
            <dt>Location</dt>
            <dd>
              {feature.locationType.replaceAll('_', ' ')} ({feature.locationConfidence})
            </dd>
            <dt>Review status</dt>
            <dd>Published record</dd>
          </dl>
        </>
      )}
      {feature.shortDescription && <p>{feature.shortDescription}</p>}
      {feature.narrative?.map((component) => (
        <p key={component.kind}>{component.text}</p>
      ))}
      {isCurrentPlace && (
        <section className="osm-details">
          <h3>
            {profile === 'mapped_context'
              ? 'Mapped context details'
              : 'Verified current-place details'}
          </h3>
          <p>
            {profile === 'mapped_context'
              ? 'Mapped present-day context only. It does not confirm public access, availability, accessibility, fees, opening hours or current operation. '
              : 'Only fields supported by claim-specific evidence are shown. '}
            {osmSourceUrl && (
              <a href={osmSourceUrl} target="_blank" rel="noreferrer">
                View this place in OpenStreetMap
              </a>
            )}
          </p>
          {shownCurrentClaims.length > 0 && (
            <dl className="osm-detail-list">
              {shownCurrentClaims.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {osmWebsite && (
            <p>
              <a href={osmWebsite} target="_blank" rel="noreferrer">
                Visit the place website
              </a>
            </p>
          )}
          {currentDetails.length === 0 && currentClaims.length === 0 && (
            <p className="source-notes">
              No additional claim-supported visitor details are available.
            </p>
          )}
        </section>
      )}
      <h3>Sources</h3>
      {feature.sourceRecords.map((source) => {
        const sourceUrl = safeExternalUrl(source.sourceUrl);
        return (
          <div className="source" key={`${source.sourceName}-${source.sourceUrl ?? ''}`}>
            <strong>{source.sourceOrganisation}</strong>
            <br />
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {source.sourceName}
              </a>
            ) : (
              source.sourceName
            )}
            <br />
            <small>
              {source.reliability.replaceAll('_', ' ')} · accessed{' '}
              {new Date(source.accessedAt).toLocaleDateString()}
            </small>
          </div>
        );
      })}
    </aside>
  );
}
