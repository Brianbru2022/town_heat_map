# Townscape Cohort D current-evidence verification

Reviewed: 2026-09-03T23:35:03.580Z

- Exact triage cohort reviewed: **92**
- Promoted publishable: **0**
- Current OSM elements migrated to mapped context: **90**
- Remaining provisional: **90**
- Requires review/escalated: **2**
- Withheld/out of scope: **0**
- Existing information corrected: **0**
- Adequate current evidence not found / withheld: **2**

## Decision

The exact 414-record cohort was frozen with membership SHA-256 b994b6f9511b59a5dbdcea8166de3eceb43d52abf20a44c2744c77a17c39d824. 90 current elements received mapped_context and a Tier M mapped_identity claim; 2 Gone/deleted elements were escalated to requires_review. No OSM-only facility was promoted to a stronger claim tier.

The JSON file is the individual decision register. It records the current OSM URL/tags, authority sources consulted, decision, evidence limitation and source-history result for every record.

## Validation

Each project package was passed through `validateFeatures` after its controlled batch. Current-element public projections were checked against the mapped-context allowlist; unsupported operational and editorial OSM fields were suppressed.

