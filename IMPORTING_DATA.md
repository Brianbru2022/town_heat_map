# Importing data

Run `npm run import-data -- <file.geojson> <organisation> <source-url> <licence>` to inspect a GeoJSON FeatureCollection. Convert KML, GPX, Shapefile, GeoPackage, WFS/Ogc API/ArcGIS downloads, and CSV using a documented GDAL/OGR pipeline, map fields to the neutral schema, attach source records, then run `npm run validate-data` and `npm run audit-published-projects`.

Newly imported records should remain `provisional` (the safe default) until a curator verifies the evidence. An evidence-review workflow may set `publication.state` to `verified`; it must not set `publishable` merely because parsing or schema validation succeeded. Package approval and the automated provenance, licence, and geometry gates jointly determine public delivery. Imports must update source history rather than replacing it.
