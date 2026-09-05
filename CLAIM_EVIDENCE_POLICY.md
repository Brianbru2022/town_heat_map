# Claim-relative evidence and publication policy

Townscape Guides publishes defensible visitor information, not a claim that every low-level mapped fact has been independently inspected. Publication is therefore decided at two levels: the existing record workflow state and the evidence available for each public claim. A record must still pass the normal package, provenance, licence and geometry gates. Passing those gates does not authorise every field on the record.

## Evidence tiers

| Tier                      | Meaning                                                                               | Examples                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M — mapped context        | A current map object supports only existence-as-mapped, broad type and location.      | Bench, bin, playground item, mapped parking area, mapped toilets object, park, path geometry, or mapped charging-station object. |
| F — corroborated facility | An authority, owner or operator source supports a defined visitor-facility fact.      | Public availability, operator, fees, opening hours, capacity or identified public toilets.                                       |
| O — operational/current   | A suitably current authority or operator source supports a volatile operational fact. | Current business operation, EV charging operation, accessibility, closures and route/access restrictions.                        |
| E — editorial             | Townscape has made and recorded an editorial judgement.                               | Recommendation, score, quality assessment or visitor suitability.                                                                |

OSM may be sufficient by itself for Tier M when the element is current, licensed, geographically plausible and the public wording remains explicitly map-relative. OSM alone is never sufficient for Tier F, O or E. A source marked `discovery_only`, or another OSM source, cannot be the independent source for those tiers.

## Presentation profiles

- `mapped_context` exposes only Tier M claims and identifies the information as mapped context.
- `verified_facility` may expose Tier F and Tier O fields only when each field has live, unexpired `claimEvidence` linked to a retained non-OSM source.
- `editorial` additionally permits Tier E copy and judgements when explicit editorial evidence is present.

The profiles do not replace `provisional`, `verified`, `publishable` or `withheld`. They constrain the public projection of a record that is otherwise publishable. Legacy `reviewed: true` may retain its existing workflow interpretation, but cannot bypass the profile or field allowlist.

## Claim classes and freshness

| Record or claim                                       | OSM alone                                                                            | Corroboration and prohibited claims                                                                                                                                                                                     | Reverification expectation                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Benches, bins, picnic tables and playground equipment | Tier M existence-as-mapped, broad type and location.                                 | Public access, condition, suitability and recommendations need stronger evidence.                                                                                                                                       | Recheck OSM within 12–24 months; sooner after a report or material edit.                     |
| Parks and physical open spaces                        | Tier M boundary/location and mapped type.                                            | Public access, facilities, operator, opening and suitability require authority/operator or explicit editorial evidence.                                                                                                 | Tier M annually; facility facts within 12 months.                                            |
| Parking                                               | Tier M mapped parking object, broad parking type and location.                       | Do not imply public/customer eligibility, fees, capacity, disabled spaces or availability without the corresponding F/O claim. Prefer council, landowner or operator pages.                                             | Tier M annually; fees/access/capacity within 6 months; closures promptly.                    |
| Toilets                                               | Tier M mapped toilets object and location, described as mapped toilets.              | “Public”, opening, fee and operator require Tier F; accessibility and temporary availability require Tier O. Prefer council or operator facility pages.                                                                 | Tier M annually; F within 6 months; O within 3 months or the source's stated validity.       |
| EV charging                                           | Tier M may identify a mapped charging-station object only.                           | Connectors, network, authentication, accessibility and operational availability require Tier O operator/network evidence.                                                                                               | Reverify Tier O within 30–90 days.                                                           |
| Businesses                                            | Tier M supports only a mapped named/type/location object and must not imply trading. | Current operation, contact/site link and operational accessibility require Tier O; hours, fees and operator identity require at least Tier F. Prefer the operator's current site, regulator or authoritative directory. | Reverify current operation within 90 days and hours within 3–6 months.                       |
| Routes and paths                                      | Tier M supports mapped geometry and broad physical classification.                   | Legal/public access, permitted modes, restrictions, diversions and closures require Tier O authority, land-manager or route-operator evidence.                                                                          | Tier M annually; restrictions within 90 days; temporary notices expire on their stated date. |
| Accessibility                                         | Never sufficient from OSM alone for a public assurance.                              | Requires Tier O evidence specific to the facility and attribute. Avoid generalising from a site-level statement to every object.                                                                                        | Normally 6 months; immediately after reported physical or operational change.                |
| Recommendations, scores and suitability               | Never.                                                                               | Requires an explicit Tier E Townscape editorial determination. No score or recommendation is inferred from OSM popularity, naming, tags or mere corroboration.                                                          | Review within 24 months and after material change.                                           |

`expiresAt` is required operationally whenever the claim can become stale; an expired claim is suppressed and reported as an advisory rather than causing a safe Tier M record to disappear. A deleted, invisible or unavailable OSM element is a publication blocker and resolves to `requires_review`. HTTP 404/410 or “Gone” means only that the map element is no longer current; it is not evidence that the real-world object has been removed.

## Public projection and licensing

The public/API projection filters parsed current-place fields by claim. Mapped type keys remain available; access, hours, fee, operator, capacity, accessibility, business-operation, EV-operation and route-access fields require their respective evidence. A claim-constrained record exposes only generated current-place details that passed the field allowlist. Arbitrary source notes, review notes, publication notes and claim-evidence notes are internal and are never copied to the public package. Non-editorial claim-constrained descriptions are replaced by the standard mapped-context wording; editorial copy requires an editorial profile and current Tier E evidence.

Project research notes, source limitation notes, map notes, town-study working notes and imported curation metadata are also internal. The public package retains the structured source identity, URL, access date, reliability, licence and quoted historic-date fields needed for provenance, plus generated validation and licence declarations. Source packages are not mutated, so the full research history remains available to curators.

Every public package containing an OSM-derived component carries an ODbL component declaration and `© OpenStreetMap contributors` attribution. A configured basemap-provider credit is additive and cannot replace the OSM credit. The component declaration deliberately does not determine whether the combined Townscape product is a derivative database or collective database; that remains a documented legal-review question.

## Runtime schema and fail-closed behaviour

The JSON Schema in `schemas/historic-town-project.schema.json` is compiled with Ajv and is authoritative for package structure and publication-sensitive values. Static catalogue JSON is asserted during module loading, so invalid checked-in data fails validation, tests, build and API startup. The data-validation and database-seed commands repeat the assertion explicitly.

Database packages are validated when listed or retrieved; an invalid row is logged and omitted from public delivery rather than taking down unrelated towns. Publication assessment and `publicProjectPackage` validate their input independently, so callers that bypass a normal loader still resolve the entire invalid package to withheld/non-public. The ordinary API client consumes only that already validated, claim-safe projection; the lazy curator path may reassess it when building its local review queue.

Unknown publication states, claim types, evidence tiers, publication profiles and OSM statuses are never coerced to a stronger valid value. Malformed claim evidence cannot support a claim. Safe legacy records remain supported only through the documented absence defaults: a missing feature declaration uses `reviewed` to choose verified/provisional, while a missing package declaration remains provisional and cannot publish.

## Controlled migration procedure

1. Freeze a cohort and export a read-only before snapshot with record IDs, workflow state and source hashes.
2. Recheck each OSM element and capture type, ID, version, last-edit timestamp, changeset, visibility/status and retrieval date where returned.
3. Assign `mapped_context` without adding stronger claims. Deleted, Gone or unavailable elements go to review.
4. For each proposed stronger field, add a retained authority/operator/editorial source and one claim-evidence entry with a review date and appropriate expiry.
5. Use `verified_facility` only when at least one F/O claim is actually supported; use `editorial` only for recorded E decisions.
6. Preview the public projection and compare it with the allowlist. Do not infer object identity from broader site-level corroboration.
7. Run schema, validation, unit, API, build and publication-audit gates.
8. Produce an after report listing promotions, suppressions, review escalations and unchanged records. Apply changes in small, reversible batches with human sign-off.

The existing 414-record Cohort D is not migrated by this architecture change. Its 412 current and two Gone decisions remain exactly as recorded until a separately authorised controlled migration follows this procedure.
