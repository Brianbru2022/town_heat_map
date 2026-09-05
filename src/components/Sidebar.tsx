import { useEffect, useState } from 'react';
import { useExplorerStore } from '../app/store';
import { sortPublishedProjects } from '../domain/projects';

const hesDesignationsLayerId = 'hes-listed-buildings-by-category';
const unspecifiedCounty = 'Unspecified county';

export function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [townSearch, setTownSearch] = useState('');
  const pkg = useExplorerStore((state) => state.package);
  const query = useExplorerStore((state) => state.query);
  const setQuery = useExplorerStore((state) => state.setQuery);
  const possible = useExplorerStore((state) => state.possible);
  const setPossible = useExplorerStore((state) => state.setPossible);
  const settlementAge = useExplorerStore((state) => state.settlementAge);
  const setSettlementAge = useExplorerStore((state) => state.setSettlementAge);
  const showAreaPolygons = useExplorerStore((state) => state.showAreaPolygons);
  const setShowAreaPolygons = useExplorerStore((state) => state.setShowAreaPolygons);
  const excludeUndated = useExplorerStore((state) => state.excludeUndated);
  const setExcludeUndated = useExplorerStore((state) => state.setExcludeUndated);
  const demolished = useExplorerStore((state) => state.demolished);
  const setDemolished = useExplorerStore((state) => state.setDemolished);
  const activeMap = useExplorerStore((state) => state.activeMap);
  const setActiveMap = useExplorerStore((state) => state.setActiveMap);
  const showHesDesignations = useExplorerStore((state) => state.showHesDesignations);
  const setShowHesDesignations = useExplorerStore((state) => state.setShowHesDesignations);
  const showPublicArt = useExplorerStore((state) => state.showPublicArt);
  const setShowPublicArt = useExplorerStore((state) => state.setShowPublicArt);
  const showPlaquesAndMemorials = useExplorerStore((state) => state.showPlaquesAndMemorials);
  const setShowPlaquesAndMemorials = useExplorerStore((state) => state.setShowPlaquesAndMemorials);
  const showCurrentContext = useExplorerStore((state) => state.showCurrentContext);
  const setShowCurrentContext = useExplorerStore((state) => state.setShowCurrentContext);
  const showOsmFood = useExplorerStore((state) => state.showOsmFood);
  const setShowOsmFood = useExplorerStore((state) => state.setShowOsmFood);
  const showOsmPicnic = useExplorerStore((state) => state.showOsmPicnic);
  const setShowOsmPicnic = useExplorerStore((state) => state.setShowOsmPicnic);
  const showOsmArt = useExplorerStore((state) => state.showOsmArt);
  const setShowOsmArt = useExplorerStore((state) => state.setShowOsmArt);
  const showOsmMemorials = useExplorerStore((state) => state.showOsmMemorials);
  const setShowOsmMemorials = useExplorerStore((state) => state.setShowOsmMemorials);
  const showOsmHistoricPlaces = useExplorerStore((state) => state.showOsmHistoricPlaces);
  const setShowOsmHistoricPlaces = useExplorerStore((state) => state.setShowOsmHistoricPlaces);
  const showOsmLeisure = useExplorerStore((state) => state.showOsmLeisure);
  const setShowOsmLeisure = useExplorerStore((state) => state.setShowOsmLeisure);
  const showOsmVisitor = useExplorerStore((state) => state.showOsmVisitor);
  const setShowOsmVisitor = useExplorerStore((state) => state.setShowOsmVisitor);
  const showOsmAmenities = useExplorerStore((state) => state.showOsmAmenities);
  const setShowOsmAmenities = useExplorerStore((state) => state.setShowOsmAmenities);
  const showOsmParking = useExplorerStore((state) => state.showOsmParking);
  const setShowOsmParking = useExplorerStore((state) => state.setShowOsmParking);
  const showOsmNature = useExplorerStore((state) => state.showOsmNature);
  const setShowOsmNature = useExplorerStore((state) => state.setShowOsmNature);
  const showHistoricLegend = useExplorerStore((state) => state.showHistoricLegend);
  const setShowHistoricLegend = useExplorerStore((state) => state.setShowHistoricLegend);
  const showOsmLegend = useExplorerStore((state) => state.showOsmLegend);
  const setShowOsmLegend = useExplorerStore((state) => state.setShowOsmLegend);
  const archaeologyOnly = useExplorerStore((state) => state.archaeologyOnly);
  const setArchaeologyOnly = useExplorerStore((state) => state.setArchaeologyOnly);
  const communityLayersOnly = useExplorerStore((state) => state.communityLayersOnly);
  const setCommunityLayersOnly = useExplorerStore((state) => state.setCommunityLayersOnly);
  const publishedProjects = useExplorerStore((state) => state.publishedProjects);
  const loadStatus = useExplorerStore((state) => state.loadStatus);
  const loadError = useExplorerStore((state) => state.loadError);
  const loadPackage = useExplorerStore((state) => state.loadPackage);
  const retryLoad = useExplorerStore((state) => state.retryLoad);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  if (!pkg) return null;
  const hasHesDesignations = pkg.historicMaps.some((map) => map.id === hesDesignationsLayerId);
  const sortedProjects = sortPublishedProjects(publishedProjects);
  const countries = [...new Set(sortedProjects.map((project) => project.country))];
  const counties = [
    ...new Set(
      sortedProjects
        .filter((project) => project.country === pkg.project.country)
        .map((project) => project.region ?? unspecifiedCounty),
    ),
  ];
  const townsInCounty = sortedProjects.filter(
    (project) =>
      project.country === pkg.project.country &&
      (project.region ?? unspecifiedCounty) === (pkg.project.region ?? unspecifiedCounty),
  );
  const matchingTowns = townsInCounty.filter((project) =>
    project.locality.toLocaleLowerCase().includes(townSearch.trim().toLocaleLowerCase()),
  );
  const townOptions = townSearch ? matchingTowns : townsInCounty;

  function selectPackage(id: string) {
    const next = sortedProjects.find((candidate) => candidate.id === id);
    if (next) void loadPackage(next.id);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div className="brand">
          <span>HISTORIC</span>
          <strong>TOWN EXPLORER</strong>
        </div>
        <button
          className="settings-button"
          type="button"
          aria-label="Open settings"
          aria-expanded={settingsOpen}
          title="Explorer settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
      <label>
        Country
        <select
          value={pkg.project.country}
          aria-label="Country"
          onChange={(event) => {
            const next = sortedProjects.find(
              (candidate) => candidate.country === event.target.value,
            );
            if (next) {
              setTownSearch('');
              void loadPackage(next.id);
            }
          }}
        >
          {countries.map((country) => (
            <option value={country} key={country}>
              {country}
            </option>
          ))}
        </select>
      </label>
      <label>
        County
        <select
          value={pkg.project.region ?? unspecifiedCounty}
          aria-label="County"
          onChange={(event) => {
            const next = sortedProjects.find(
              (candidate) =>
                candidate.country === pkg.project.country &&
                (candidate.region ?? unspecifiedCounty) === event.target.value,
            );
            if (next) {
              setTownSearch('');
              void loadPackage(next.id);
            }
          }}
        >
          {counties.map((county) => (
            <option value={county} key={county}>
              {county}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search towns
        <input
          type="search"
          value={townSearch}
          aria-label="Search towns"
          onChange={(event) => setTownSearch(event.target.value)}
          placeholder="Start typing a town name…"
        />
      </label>
      <label>
        Town
        <select
          value={townOptions.some((project) => project.id === pkg.project.id) ? pkg.project.id : ''}
          aria-label="Town"
          onChange={(event) => selectPackage(event.target.value)}
        >
          {!townOptions.some((project) => project.id === pkg.project.id) && (
            <option value="" disabled>
              {matchingTowns.length ? 'Choose a town' : 'No matching towns'}
            </option>
          )}
          {townOptions.map((project) => (
            <option value={project.id} key={project.id}>
              {project.locality}
            </option>
          ))}
        </select>
      </label>
      <p className="project-meta">
        {pkg.project.locality}, {pkg.project.country}
      </p>
      <p className="town-summary">
        Explore source-backed historic places, maps and evidence across {pkg.project.locality}
        {pkg.project.region ? `, ${pkg.project.region}` : ''}.
      </p>
      {loadStatus === 'loading' && <p role="status">Loading the selected town guide…</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void retryLoad()}>
            Try again
          </button>
        </div>
      )}
      <label>
        Search features
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, type, street…"
        />
      </label>
      <p className="map-key">
        Historic dot colour shows the earliest evidence century: purple is oldest, then red, orange
        and amber; blue means no usable historic date.
      </p>
      {settingsOpen && (
        <>
          <button
            type="button"
            className="settings-backdrop"
            aria-label="Close explorer settings"
            onClick={() => setSettingsOpen(false)}
          />
          <section
            className="settings-popover"
            aria-label="Explorer settings"
            role="dialog"
            aria-modal="true"
          >
            <div className="settings-popover-heading">
              <h2>Explorer settings</h2>
              <button
                type="button"
                className="icon"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <fieldset>
              <legend>Timeline visibility</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={possible}
                  onChange={(event) => setPossible(event.target.checked)}
                />
                Include possibly present
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={excludeUndated}
                  onChange={(event) => setExcludeUndated(event.target.checked)}
                />
                Show only entries with established dates
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={demolished}
                  onChange={(event) => setDemolished(event.target.checked)}
                />
                Show demolished features
              </label>
            </fieldset>
            <fieldset>
              <legend>Evidence layers</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settlementAge}
                  onChange={(event) => setSettlementAge(event.target.checked)}
                />
                Show settlement-age evidence
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showAreaPolygons}
                  onChange={(event) => setShowAreaPolygons(event.target.checked)}
                />
                Show heritage area polygons
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showCurrentContext}
                  onChange={(event) => setShowCurrentContext(event.target.checked)}
                />
                Show current parks &amp; open spaces
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={archaeologyOnly}
                  onChange={(event) => setArchaeologyOnly(event.target.checked)}
                />
                Archaeology evidence only
              </label>
            </fieldset>
            <fieldset>
              <legend>Map key</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showHistoricLegend}
                  onChange={(event) => setShowHistoricLegend(event.target.checked)}
                />
                Show historic-date colours
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmLegend}
                  onChange={(event) => setShowOsmLegend(event.target.checked)}
                />
                Show OSM category icons
              </label>
            </fieldset>
            <fieldset>
              <legend>Community layers</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={communityLayersOnly}
                  onChange={(event) => setCommunityLayersOnly(event.target.checked)}
                />
                Only community layers
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showPublicArt}
                  onChange={(event) => setShowPublicArt(event.target.checked)}
                />
                Show public art
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showPlaquesAndMemorials}
                  onChange={(event) => setShowPlaquesAndMemorials(event.target.checked)}
                />
                Show plaques &amp; memorials
              </label>
            </fieldset>
            <fieldset>
              <legend>Current OSM places</legend>
              <p className="settings-help">
                Optional present-day OSM places with their own map icons. They are not historic
                evidence.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmFood}
                  onChange={(event) => setShowOsmFood(event.target.checked)}
                />
                Food &amp; drink
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmPicnic}
                  onChange={(event) => setShowOsmPicnic(event.target.checked)}
                />
                Picnic &amp; rest
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmArt}
                  onChange={(event) => setShowOsmArt(event.target.checked)}
                />
                Art &amp; culture
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmMemorials}
                  onChange={(event) => setShowOsmMemorials(event.target.checked)}
                />
                Memorials &amp; plaques
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmHistoricPlaces}
                  onChange={(event) => setShowOsmHistoricPlaces(event.target.checked)}
                />
                Historic places
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmLeisure}
                  onChange={(event) => setShowOsmLeisure(event.target.checked)}
                />
                Leisure
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmVisitor}
                  onChange={(event) => setShowOsmVisitor(event.target.checked)}
                />
                Visitor information
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmAmenities}
                  onChange={(event) => setShowOsmAmenities(event.target.checked)}
                />
                Amenities
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmParking}
                  onChange={(event) => setShowOsmParking(event.target.checked)}
                />
                Parking
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showOsmNature}
                  onChange={(event) => setShowOsmNature(event.target.checked)}
                />
                Natural sights
              </label>
            </fieldset>
            {hasHesDesignations && (
              <fieldset>
                <legend>Live cross-check</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showHesDesignations}
                    onChange={(event) => setShowHesDesignations(event.target.checked)}
                  />
                  Show current HES designations (external symbols)
                </label>
              </fieldset>
            )}
          </section>
        </>
      )}
      <fieldset>
        <legend>Historic map</legend>
        <select
          value={activeMap?.id ?? ''}
          onChange={(event) =>
            setActiveMap(pkg.historicMaps.find((map) => map.id === event.target.value))
          }
        >
          <option value="">No historic map selected</option>
          {pkg.historicMaps
            .filter(
              (map) =>
                map.id !== hesDesignationsLayerId &&
                Boolean(map.tileUrl) &&
                (map.layerType === 'xyz' ||
                  map.layerType === 'wms' ||
                  map.layerType === 'georeferenced_raster_tiles'),
            )
            .map((map) => (
              <option value={map.id} key={map.id}>
                {map.displayDate} — {map.title}
              </option>
            ))}
        </select>
        {activeMap?.id.endsWith('-alignment-review') && (
          <p className="map-review-notice">
            Draft local overlay for alignment review only. It is excluded from production and is not
            approved for digitisation or export.
          </p>
        )}
        {activeMap && (
          <label>
            Opacity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={activeMap.opacity}
              onChange={(event) =>
                setActiveMap({ ...activeMap, opacity: Number(event.target.value) })
              }
            />
          </label>
        )}
      </fieldset>
    </aside>
  );
}
