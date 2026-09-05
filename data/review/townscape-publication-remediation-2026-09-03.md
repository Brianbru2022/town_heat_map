# Townscape Guides Publication-blocker Remediation

Reviewed: 2026-09-03T00:00:00.000Z

Geometry: 14 resolved; 23 remains non-publishable.
Licence: 33 HES Listed Buildings records resolved from the local OGL spatial snapshot; the Culross plaque is retained from CC0 Wikidata metadata with the Women of Scotland record citation-only.

## Geometry resolved

- **alloa-scotland / curated:context-early-street-core-1702:** Current named street-centre lines were checked against the council appraisal’s named 1702 core; the geometry is explicitly a present-day alignment, not an asserted 1702 cadastral boundary.
- **alva-scotland / curated:context-alva-house:** Matched to the existing HES NRHE Alva House representative point (111955, 1m stated precision).
- **alva-scotland / curated:context-glentana:** Matched to HES NRHE Glentana Mills (47074); retained as a representative point because the official record states 100m positional accuracy.
- **alva-scotland / curated:context-railway:** Matched to HES NRHE Alva Station (139051, 1m stated precision), not a reconstructed branch-line alignment.
- **alva-scotland / curated:context-games:** The operator and Council both locate the Games in Johnstone Park; the existing OSM park polygon supplies the location geometry.
- **alva-scotland / curated:context-illuminations:** Recorded as an explicitly representative point for Alva Glen from HES NRHE 47054 (10m stated precision), not as the extent of every illumination installation.
- **alva-scotland / curated:context-academy:** Matched to the current Alva Academy campus polygon in OSM; the record describes the continuing institution and labels the geometry as the current campus.
- **culross-scotland / curated:area-culross-conservation:** Imported the current HES Conservation Areas spatial polygon CA143, rather than inferring an area from listed-building density.
- **kincardine-on-forth-scotland / curated:area-kincardine-conservation:** Imported the current HES Conservation Areas spatial polygon CA153.
- **kincardine-on-forth-scotland / curated:context-high-kirk-elphinstone-core:** Current named street-centre lines were imported for the exact streets identified by the appraisal; this is not presented as a historic building polygon.
- **tillicoultry-scotland / curated:context-glassford-square:** Matched to the current named Glassford Square street-centre line (OSM way 20353620).
- **tillicoultry-scotland / curated:context-craigfoot-mill:** Matched to HES NRHE Craigfoot Mill 48283 (10m stated precision).
- **tillicoultry-scotland / curated:context-middleton:** Matched to HES NRHE Middleton Mills 48275; the 100m stated precision is retained as a representative point.
- **tillicoultry-scotland / curated:mem-eu-ww2:** Matched to the HES NRHE Evangelical Union Congregational Church point 260240 (1m stated precision). IWM material remains citation-only.

## Geometry still non-publishable

- **alloa-scotland / curated:context-bedford-place-expansion:** The appraisal identifies the phase but not a reproducible 1820s–1830s extent; a georeferenced period map is still required.
- **alloa-scotland / curated:context-railway-arrival:** The appraisal supports the dates, but not a period-specific branch alignment; the modern railway must not stand in for it.
- **alloa-scotland / curated:context-glebe-victorian-expansion:** A character-area description is not a surveyed Victorian development polygon.
- **alloa-scotland / curated:context-mill-street-3-29:** The appraisal identifies a group, but the constituent buildings have not each been matched to verified current building geometry.
- **alloa-scotland / curated:context-baronial-buildings:** The appraisal places it at Coalgate and West Vennel, but the exact building footprint has not been independently matched.
- **alloa-scotland / curated:context-oakleigh-house:** No authoritative address-to-footprint match was found for the appraisal’s Oakleigh House reference.
- **alloa-scotland / curated:context-alloa-harbour-docks:** The historic harbour/dock extent and branch alignment require period mapping; no surrogate modern waterfront polygon was used.
- **alva-scotland / curated:context-first-mill:** The history identifies the industrial phase but does not identify a mappable first-mill site.
- **alva-scotland / curated:memorial-carrie-johnstone-fountain:** Johnstone Park is evidenced, but no source fixes the fountain within the park; a park-wide geometry would falsely imply the fountain’s footprint.
- **alva-scotland / curated:public-art-river-spirit:** The Council identifies Collylands Roundabout but no independently verified sculpture coordinate was obtained. The former Geograph citation was a different, Shetland image and has been removed.
- **culross-scotland / curated:context-nts-royal-burgh-portfolio:** This is a portfolio group with several properties, not one mappable asset; it remains a non-public linking record until individual links are modelled.
- **kincardine-on-forth-scotland / curated:context-burgh-of-barony-1663:** The burgh history does not establish a bounded 1663 core; a historic-map interpretation remains necessary.
- **kincardine-on-forth-scotland / curated:context-power-station:** No authoritative digitised station/reclamation footprint was located; a contemporary shoreline would be misleading after demolition and reclamation.
- **tillicoultry-scotland / curated:context-cloth-1560s:** Early cloth manufacture is a diffuse activity, not a named site in the source.
- **tillicoultry-scotland / curated:context-three-villages:** The three named settlement components need separately evidenced historic extents; a single broad polygon would invent their limits.
- **tillicoultry-scotland / curated:context-water-mill:** The source dates the first water-powered mill but does not identify a mappable site.
- **tillicoultry-scotland / curated:context-high-street:** The source describes expansion along and south of High Street but does not supply a defensible phase boundary.
- **tillicoultry-scotland / curated:context-workers-grid:** The planned-grid extent needs a dated mapped comparison; it cannot be inferred from today’s street pattern alone.
- **tillicoultry-scotland / curated:context-railway:** No period-specific Devon Valley line alignment was imported; the current network is not a substitute.
- **tillicoultry-scotland / curated:context-burgh:** Police-burgh status is a civic history fact, not a discrete spatial feature in the cited source.
- **tillicoultry-scotland / curated:context-flood-1883:** The source establishes the event but not a surveyed impact extent or a single event location.
- **tillicoultry-scotland / curated:plaque-conn:** The IWM entry is citation-only and no independently verified precise plaque location was found.
- **tillicoultry-scotland / curated:mem-walker-fountain:** The appraisal identifies the fountain but no authoritative coordinate or surveyed footprint was found.

## Licence determinations

- HES Listed Buildings: the locally held spatial snapshot is the provenance for this cohort and is OGL v3.0; retain the prescribed Historic Environment Scotland and OS attribution.
- Women of Scotland: no reuse licence was obtained; only a link is retained. The Culross plaque coordinate/basic metadata comes from Wikidata CC0 structured data.
- Clackmannanshire Council: treated as evidence/citation only in this remediation; no Council text or media is redistributed.
