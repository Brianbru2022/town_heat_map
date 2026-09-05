# Townscape HES/NRHE exception-review milestone

Reviewed: 2026-09-03T21:05:22.213Z

## Baseline reconciled

- Partial-overlap polygons: 7
- Buffer-only records: 57
- Provenance exceptions: 8
- Unsupported-wording exceptions: 4

## Cross-boundary rule

Keep authoritative geometry unchanged. A feature that crosses a locality boundary may be published only as related context where an authoritative designation or record identity explicitly names the Townscape locality or establishes the feature as a named component of it. Label it locality-spanning; do not count it as wholly in-boundary or use it in locality scoring. Otherwise retain it as provisional or withhold it. Geometric overlap and buffer distance alone never establish the relationship.

## Partial-overlap decisions

- culross-scotland / hes-conservation-area:CA143 — CULROSS
- kincardine-on-forth-scotland / hes-conservation-area:CA153 — KINCARDINE
- tillicoultry-scotland / hes-conservation-area:CA512 — TILLICOULTRY
- biggar-scotland / hes-conservation-area:CA391 — BIGGAR
- biggar-scotland / hes-scheduled-monument:SM5492 — Prehistoric settlement and enclosure, 65m ENE of 21 Colliehill Road, Biggar
- killin-scotland / hes-conservation-area:CA544 — KILLIN
- killin-scotland / hes-scheduled-monument:SM4675 — Finlarig Castle,castle,earthworks & mausoleum

All seven have an identity-based locality relationship and are published only as related, locality-spanning context. The HES geometry is unchanged.

## Buffer-only decisions

- Reviewed: 57
- Published as clearly labelled related context: 30
- Withheld as another locality/no documented town relationship: 27
- Unresolved: 0

### Published related context

- culross-scotland / nrhe:48031 — CULROSS
- culross-scotland / nrhe:48064 — CULROSS, THE MOAT, COAL SHAFT
- culross-scotland / nrhe:86468 — CULROSS, LOW CAUSEWAY
- culross-scotland / nrhe:92392 — CULROSS HARBOUR
- culross-scotland / nrhe:280709 — CULROSS
- culross-scotland / nrhe:280710 — CULROSS
- kincardine-on-forth-scotland / nrhe:48072 — KINCARDINE ON FORTH, KINCARDINE HOUSE
- kincardine-on-forth-scotland / nrhe:93179 — KINCARDINE ON FORTH, KELLYWOOD CRESCENT
- kincardine-on-forth-scotland / nrhe:93180 — KINCARDINE ON FORTH, KELLYWOOD CRESCENT, KELLYWOOD WORKINGS
- kincardine-on-forth-scotland / nrhe:123074 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, JETTY
- kincardine-on-forth-scotland / nrhe:68086 — KINCARDINE ON FORTH, KINCARDINE POWER STATION
- kincardine-on-forth-scotland / nrhe:259537 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, ADMINISTRATION, ABLUTIONS AND WORKSHOP BUILDING
- kincardine-on-forth-scotland / nrhe:268843 — KINCARDINE EASTERN LINK ROAD
- kincardine-on-forth-scotland / nrhe:277533 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, WATER TREATMENT PLANT HOUSE
- kincardine-on-forth-scotland / nrhe:277534 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, FIRE FIGHTING PUMPHOUSE
- kincardine-on-forth-scotland / nrhe:277095 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, ASH SLURRY HOUSE
- kincardine-on-forth-scotland / nrhe:277101 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, CHIMNEYS
- kincardine-on-forth-scotland / nrhe:277102 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, WATER HOUSE
- kincardine-on-forth-scotland / nrhe:277103 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, COOLING WATER PUMPHOUSE
- kincardine-on-forth-scotland / nrhe:276991 — KINCARDINE ON FORTH, KINCARDINE POWER STATION, TURBINE HALL
- tillicoultry-scotland / nrhe:48260 — TILLICOULTRY
- tillicoultry-scotland / nrhe:48282 — TILLICOULTRY, WATER POWER SYSTEM
- tillicoultry-scotland / nrhe:48286 — TILLICOULTRY, RAILWAY VIADUCT
- tillicoultry-scotland / nrhe:48288 — TILLICOULTRY (EAST)
- tillicoultry-scotland / nrhe:48295 — TILLICOULTRY
- tillicoultry-scotland / nrhe:48296 — TILLICOULTRY
- tillicoultry-scotland / nrhe:243538 — TILLICOULTRY, DEVONSIDE, ALEXANDRA STREET, DEVONPARK KNITWEAR FACTORY
- tillicoultry-scotland / nrhe:308562 — TILLICOULTRY, ALVA ROAD, TILLICOULTRY GOLF COURSE
- tillicoultry-scotland / nrhe:378491 — TILLICOULTRY, WEAVING MILL
- tillicoultry-scotland / nrhe:350879 — TILLICOULTRY, CHAPELLE STREET, TILLICOULTRY ALLOTMENTS

### Withheld / out of scope

- culross-scotland / nrhe:153472 — DUNIMARLE CASTLE
- kincardine-on-forth-scotland / nrhe:48108 — INCH HOUSE
- kincardine-on-forth-scotland / nrhe:48109 — OLD TULLIALLAN CASTLE
- kincardine-on-forth-scotland / nrhe:48113 — TULLIALLAN
- kincardine-on-forth-scotland / nrhe:48114 — TULLIALLAN
- kincardine-on-forth-scotland / nrhe:48116 — TULLIALLAN CASTLE, ICE HOUSE
- kincardine-on-forth-scotland / nrhe:48124 — TULLIALLAN PARISH
- kincardine-on-forth-scotland / nrhe:351570 — TULLIALLAN CASTLE, LAUNDRY HOUSE
- kincardine-on-forth-scotland / nrhe:162415 — INCH FARM
- kincardine-on-forth-scotland / nrhe:174313 — TULLIALLAN CASTLE, TULLIALLAN WOOD, MOORLOCH COTTAGE
- kincardine-on-forth-scotland / nrhe:174316 — INCH FARM COTTAGES
- kincardine-on-forth-scotland / nrhe:214067 — TULLIALLAN ESTATE OFFICE, PROPOSED HUTS
- kincardine-on-forth-scotland / nrhe:250320 — INCH FARM
- kincardine-on-forth-scotland / nrhe:94462 — TULLIALLAN CASTLE
- kincardine-on-forth-scotland / nrhe:174310 — TULLIALLAN CASTLE, WALLED GARDEN, GLASSHOUSES AND SUNDIAL
- tillicoultry-scotland / nrhe:48256 — HARVIESTOUN
- tillicoultry-scotland / nrhe:48258 — EASTERTOWN
- tillicoultry-scotland / nrhe:48290 — GLENFOOT BRIDGE
- tillicoultry-scotland / nrhe:48291 — LADY ANN'S WELL
- tillicoultry-scotland / nrhe:48292 — ALVA GLEN, LADY'S WELL
- tillicoultry-scotland / nrhe:48294 — CASTLE CRAIG
- tillicoultry-scotland / nrhe:106444 — DEVONSIDE
- tillicoultry-scotland / nrhe:111925 — CASTLE CRAIG
- tillicoultry-scotland / nrhe:111935 — MELLOCHFOOT, CURLING POND
- tillicoultry-scotland / nrhe:111937 — DEVONSIDE
- tillicoultry-scotland / nrhe:111940 — COALSNAUGHTON
- tillicoultry-scotland / nrhe:111942 — GLENFOOT

## Provenance decisions

Resolved: 8; unresolved: 0. Each retains source history and is supported by a locally held, licensed HES/NRHE record matching the feature identifier.

- culross-scotland / nrhe:48021 — CULROSS PALACE
- culross-scotland / nrhe:48055 — CULROSS
- culross-scotland / nrhe:92389 — CULROSS, BURNETT'S HOUSE
- culross-scotland / nrhe:124579 — CAVERNS
- culross-scotland / nrhe:124581 — CAVERNS
- culross-scotland / nrhe:165396 — MOORLOCH COTTAGE
- culross-scotland / nrhe:319300 — CULROSS ABBEY
- killin-scotland / nrhe:24194 — FINLARIG CASTLE

## Unsupported-wording corrections

The following records are now expressly limited to their historic NRHE classification; no present access, opening, facilities, operation or use is claimed.

- alva-scotland / nrhe:220554 — ALVA, EAST STIRLING STREET, PUBLIC CONVENIENCES AND BUS SHELTER
- culross-scotland / nrhe:104336 — CULROSS, PUBLIC LAVATORIES
- kincardine-on-forth-scotland / nrhe:93075 — KINCARDINE ON FORTH, BRIDGE INN
- kincardine-on-forth-scotland / nrhe:93096 — KINCARDINE ON FORTH, 19 EXCISE STREET

## Publication totals

- Before: 1297 publishable, 760 provisional, 269 withheld, 23 requires review.
- After: 1346 publishable, 684 provisional, 296 withheld, 23 requires review.

## Remaining non-publishable HES/NRHE records

- 144 provisional: No individual publication determination is recorded. The JSON companion carries the complete record list for this cohort.

