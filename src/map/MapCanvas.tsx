import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useExplorerStore, useLoadedProjectPackage } from '../app/store';
import { historicCharacterScore } from '../domain/scoring';
import { featureTimelineState, hasHistoricTimelineDate } from '../domain/timeline';
import { mapAttribution } from '../domain/attribution';
import {
  isArchaeologyEvidenceFeature,
  isMapCatalogueRecord,
  isPublicTownFeature,
} from '../domain/presentation';
import type { ScoringMethodology } from '../domain/models';
import type { PublicFeature, PublicSettlementPolygon } from '../domain/publicDto';
import type { LineString, MultiPolygon, Point, Polygon } from 'geojson';

const openStreetMapFallbackStyle = {
  version: 8,
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'openstreetmap', type: 'raster', source: 'openstreetmap' }],
};
const hesDesignationsLayerId = 'hes-listed-buildings-by-category';
// A clear blue keeps records with no usable historic evidence year distinct
// from both the dated-century palette and the OSM raster's dark POI symbols.
const historicUndatedDotColour = '#4f9bb5';

function historicDotColour(feature: PublicFeature): string {
  const century = historicEvidenceCentury(feature);
  if (century === undefined) return historicUndatedDotColour;
  if (century < 1000) return '#5d3f7f';
  if (century < 1200) return '#76365c';
  if (century < 1400) return '#913a4b';
  if (century < 1600) return '#b54d35';
  if (century < 1800) return '#d36b2d';
  if (century < 1900) return '#df9638';
  return '#e5ba57';
}
type OsmCommunityCategory =
  | 'food'
  | 'picnic'
  | 'art'
  | 'memorial'
  | 'historic'
  | 'leisure'
  | 'visitor'
  | 'amenities'
  | 'parking'
  | 'nature';
interface OsmCommunityMarker {
  category: OsmCommunityCategory;
  variant: string;
  colour: string;
}

function osmCommunityCategory(feature: PublicFeature): OsmCommunityCategory | undefined {
  // A current OSM feature can be merged into an authoritative historic record
  // (for example Alloa War Memorial into HES LB20989). Keep one data record,
  // but still allow its verified OSM category icon to be displayed.
  if (!isOsmCommunityPlace(feature) && !hasOsmCommunitySource(feature)) return undefined;
  const amenity = osmTagValue(feature, 'amenity');
  const shop = osmTagValue(feature, 'shop');
  const leisure = osmTagValue(feature, 'leisure');
  const tourism = osmTagValue(feature, 'tourism');
  const historic = osmTagValue(feature, 'historic');
  const manMade = osmTagValue(feature, 'man_made');
  const natural = osmTagValue(feature, 'natural');
  const waterway = osmTagValue(feature, 'waterway');
  if (
    ['cafe', 'ice_cream', 'restaurant'].includes(amenity ?? '') ||
    ['bakery', 'coffee'].includes(shop ?? '')
  )
    return 'food';
  if (
    ['outdoor_seating', 'picnic_table'].includes(leisure ?? '') ||
    ['bench', 'bbq', 'fountain'].includes(amenity ?? '') ||
    tourism === 'picnic_site'
  )
    return 'picnic';
  if (['artwork', 'museum', 'gallery'].includes(tourism ?? '')) return 'art';
  if (historic === 'memorial') return 'memorial';
  if (
    [
      'archaeological_site',
      'wayside_shrine',
      'monument',
      'castle',
      'fort',
      'city_gate',
      'manor',
    ].includes(historic ?? '') ||
    ['obelisk', 'tower', 'lighthouse', 'windmill'].includes(manMade ?? '')
  )
    return 'historic';
  if (['amusement_arcade', 'playground', 'miniature_golf', 'beach_resort'].includes(leisure ?? ''))
    return 'leisure';
  if (amenity === 'parking' || osmTagValue(feature, 'parking') === 'street_side') return 'parking';
  if (['toilets', 'drinking_water'].includes(amenity ?? '')) return 'amenities';
  if (
    tourism === 'information' ||
    ['guidepost', 'board', 'map', 'office', 'terminal', 'audioguide'].includes(
      osmTagValue(feature, 'information') ?? '',
    ) ||
    tourism === 'viewpoint' ||
    ['gift', 'souvenir'].includes(shop ?? '')
  )
    return 'visitor';
  if (
    ['cave_entrance', 'volcano'].includes(natural ?? '') ||
    waterway === 'waterfall' ||
    ['wildlife_hide', 'bird_hide'].includes(leisure ?? '')
  )
    return 'nature';
  for (const category of [
    'food',
    'picnic',
    'art',
    'memorial',
    'historic',
    'leisure',
    'visitor',
    'amenities',
    'parking',
    'nature',
  ] as const)
    if (feature.tags.includes(`osm-community-${category}`)) return category;
  return undefined;
}

function isOsmCommunityPlace(feature: PublicFeature): boolean {
  return feature.tags.includes('osm-community-place');
}

function hasOsmCommunitySource(feature: PublicFeature): boolean {
  return feature.sourceRecords.some(
    (source) => source.sourceName === 'OpenStreetMap current community places',
  );
}

function historicEvidenceCentury(feature: PublicFeature): number | undefined {
  // `present_by` records commonly carry only a latest possible year. That is
  // still a dated historic-evidence point and must not fall into the
  // undated/grey class.
  const evidenceYear = feature.earliestPossibleYear ?? feature.latestPossibleYear;
  return evidenceYear === undefined ? undefined : Math.floor(evidenceYear / 100) * 100;
}

function osmTagValue(feature: PublicFeature, key: string): string | undefined {
  return feature.currentPlaceDetails?.find((detail) => detail.key === key)?.value;
}

function osmCommunityMarker(feature: PublicFeature): OsmCommunityMarker | undefined {
  const category = osmCommunityCategory(feature);
  if (!category) return undefined;
  const amenity = osmTagValue(feature, 'amenity');
  const leisure = osmTagValue(feature, 'leisure');
  const tourism = osmTagValue(feature, 'tourism');
  const historic = osmTagValue(feature, 'historic');
  const memorial = osmTagValue(feature, 'memorial');
  const artworkType = osmTagValue(feature, 'artwork_type');
  const castleType = osmTagValue(feature, 'castle_type');
  const manMade = osmTagValue(feature, 'man_made');
  const shop = osmTagValue(feature, 'shop');
  if (category === 'food') {
    if (amenity === 'ice_cream') return { category, variant: 'ice-cream', colour: '#bd5d7c' };
    if (amenity === 'restaurant') return { category, variant: 'restaurant', colour: '#a3443c' };
    if (shop === 'bakery') return { category, variant: 'bakery', colour: '#c47b32' };
    if (shop === 'coffee') return { category, variant: 'coffee-shop', colour: '#603e2f' };
    return { category, variant: 'cafe', colour: '#9c4a20' };
  }
  if (category === 'picnic') {
    const variants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
      outdoor_seating: { variant: 'outdoor-seating', colour: '#3b7b58' },
      bench: { variant: 'bench', colour: '#8a6c34' },
      picnic_site: { variant: 'picnic-site', colour: '#5e7c2b' },
      picnic_table: { variant: 'picnic-table', colour: '#2d8279' },
      bbq: { variant: 'barbecue', colour: '#b25928' },
      fountain: { variant: 'fountain', colour: '#3587c5' },
    };
    const key = leisure ?? amenity ?? tourism;
    return { category, ...(variants[key ?? ''] ?? { variant: 'picnic', colour: '#397a56' }) };
  }
  if (category === 'leisure') {
    const variants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
      playground: { variant: 'playground', colour: '#137b92' },
      amusement_arcade: { variant: 'arcade', colour: '#8b3f8e' },
      miniature_golf: { variant: 'mini-golf', colour: '#229670' },
      beach_resort: { variant: 'beach', colour: '#247db4' },
    };
    return { category, ...(variants[leisure ?? ''] ?? { variant: 'leisure', colour: '#137b92' }) };
  }
  if (category === 'amenities') {
    const variants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
      toilets: { variant: 'toilets', colour: '#397f8c' },
      drinking_water: { variant: 'drinking-water', colour: '#237eb4' },
    };
    return { category, ...(variants[amenity ?? ''] ?? { variant: 'amenity', colour: '#397f8c' }) };
  }
  if (category === 'visitor') {
    const variants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
      information: { variant: 'information', colour: '#50679c' },
      viewpoint: { variant: 'viewpoint', colour: '#61744a' },
      gift: { variant: 'gift', colour: '#9a5b62' },
      souvenir: { variant: 'gift', colour: '#9a5b62' },
    };
    const information = osmTagValue(feature, 'information');
    if (tourism === 'information') {
      const informationVariants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
        guidepost: { variant: 'guidepost', colour: '#687542' },
        board: { variant: 'information-board', colour: '#b0752e' },
        map: { variant: 'map-board', colour: '#3f7d72' },
        office: { variant: 'tourist-information', colour: '#50679c' },
        terminal: { variant: 'information-terminal', colour: '#725492' },
        audioguide: { variant: 'audio-guide', colour: '#9a5b62' },
      };
      return { category, ...(informationVariants[information ?? ''] ?? variants.information) };
    }
    const key = amenity ?? tourism ?? osmTagValue(feature, 'parking') ?? shop;
    return { category, ...(variants[key ?? ''] ?? { variant: 'visitor', colour: '#50679c' }) };
  }
  if (category === 'parking') return { category, variant: 'parking', colour: '#3d5e91' };
  if (category === 'nature') {
    const natural = osmTagValue(feature, 'natural');
    const waterway = osmTagValue(feature, 'waterway');
    if (natural === 'cave_entrance') return { category, variant: 'cave', colour: '#755e4e' };
    if (waterway === 'waterfall') return { category, variant: 'waterfall', colour: '#287fb1' };
    if (natural === 'volcano') return { category, variant: 'volcano', colour: '#a64b32' };
    if (['wildlife_hide', 'bird_hide'].includes(leisure ?? ''))
      return { category, variant: 'bird-hide', colour: '#597a4c' };
    return { category, variant: 'nature', colour: '#5a8161' };
  }
  if (category === 'art' && tourism === 'artwork')
    return artworkType === 'statue'
      ? { category, variant: 'statue', colour: '#6c4c33' }
      : { category, variant: 'artwork', colour: '#87579f' };
  if (category === 'art' && tourism === 'museum')
    return { category, variant: 'museum', colour: '#416f8e' };
  if (category === 'art' && tourism === 'gallery')
    return { category, variant: 'gallery', colour: '#a65982' };
  if (category === 'memorial' && historic === 'memorial') {
    const variants: Record<string, Pick<OsmCommunityMarker, 'variant' | 'colour'>> = {
      plaque: { variant: 'plaque', colour: '#245b93' },
      blue_plaque: { variant: 'blue-plaque', colour: '#1261a0' },
      statue: { variant: 'memorial-statue', colour: '#6c4c33' },
      stone: { variant: 'memorial-stone', colour: '#6f7074' },
      bust: { variant: 'bust', colour: '#5d4466' },
    };
    return {
      category,
      ...(variants[memorial ?? ''] ?? { variant: 'memorial', colour: '#4b5795' }),
    };
  }
  if (category === 'historic' && historic === 'archaeological_site')
    return { category, variant: 'archaeology', colour: '#803f26' };
  if (historic === 'wayside_shrine') return { category, variant: 'shrine', colour: '#957321' };
  if (historic === 'monument') return { category, variant: 'monument', colour: '#674f83' };
  if (historic === 'fort') return { category, variant: 'fort', colour: '#70403b' };
  if (historic === 'city_gate') return { category, variant: 'city-gate', colour: '#766331' };
  if (historic === 'manor') return { category, variant: 'manor', colour: '#81562e' };
  if (manMade === 'obelisk') return { category, variant: 'obelisk', colour: '#596f7e' };
  if (manMade === 'tower') {
    const towerType = osmTagValue(feature, 'tower:type');
    if (towerType === 'observation')
      return { category, variant: 'observation-tower', colour: '#4b7884' };
    if (towerType === 'bell' || towerType === 'bell_tower')
      return { category, variant: 'bell-tower', colour: '#a8732d' };
    return { category, variant: 'tower', colour: '#596f7e' };
  }
  if (manMade === 'lighthouse') return { category, variant: 'lighthouse', colour: '#2e6f9a' };
  if (manMade === 'windmill') return { category, variant: 'windmill', colour: '#8a6435' };
  if (historic === 'castle')
    return castleType === 'palace' || castleType === 'stately'
      ? { category, variant: 'palace', colour: '#795685' }
      : { category, variant: 'castle', colour: '#634e76' };
  return { category, variant: 'historic-place', colour: '#4b5795' };
}

function communityMarkerImage(
  category: OsmCommunityCategory,
  colour: string,
  variant: string,
): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable for map icon rendering.');
  context.fillStyle = colour;
  context.beginPath();
  if (category === 'food') context.arc(24, 24, 21, 0, Math.PI * 2);
  else if (category === 'picnic') context.roundRect(4, 4, 40, 40, 9);
  else if (category === 'art') {
    context.moveTo(24, 2);
    context.lineTo(46, 24);
    context.lineTo(24, 46);
    context.lineTo(2, 24);
    context.closePath();
  } else if (category === 'memorial' || category === 'amenities') {
    context.arc(24, 24, 21, 0, Math.PI * 2);
  } else if (category === 'historic' || category === 'nature') {
    context.moveTo(24, 2);
    context.lineTo(42, 13);
    context.lineTo(42, 35);
    context.lineTo(24, 46);
    context.lineTo(6, 35);
    context.lineTo(6, 13);
    context.closePath();
  } else {
    context.beginPath();
    context.roundRect(4, 4, 40, 40, 9);
  }
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#fff';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (category === 'food') {
    context.strokeRect(13, 17, 18, 13);
    context.beginPath();
    context.arc(32, 22, 5, -Math.PI / 2, Math.PI / 2);
    context.moveTo(16, 34);
    context.lineTo(31, 34);
    context.moveTo(18, 13);
    context.quadraticCurveTo(16, 9, 18, 7);
    context.moveTo(25, 13);
    context.quadraticCurveTo(23, 9, 25, 7);
    context.stroke();
  } else if (category === 'picnic') {
    context.beginPath();
    context.moveTo(12, 20);
    context.lineTo(36, 20);
    context.moveTo(16, 20);
    context.lineTo(11, 34);
    context.moveTo(32, 20);
    context.lineTo(37, 34);
    context.moveTo(12, 27);
    context.lineTo(36, 27);
    context.stroke();
  } else if (category === 'art') {
    context.beginPath();
    context.moveTo(24, 11);
    context.lineTo(27, 21);
    context.lineTo(37, 24);
    context.lineTo(27, 27);
    context.lineTo(24, 37);
    context.lineTo(21, 27);
    context.lineTo(11, 24);
    context.lineTo(21, 21);
    context.stroke();
  } else if (category === 'memorial') {
    context.beginPath();
    context.roundRect(15, 11, 18, 24, 3);
    context.moveTo(19, 18);
    context.lineTo(29, 18);
    context.moveTo(19, 25);
    context.lineTo(29, 25);
    context.stroke();
  } else if (category === 'historic') {
    context.beginPath();
    context.rect(13, 21, 22, 14);
    context.moveTo(17, 21);
    context.lineTo(17, 15);
    context.lineTo(22, 15);
    context.lineTo(22, 21);
    context.moveTo(27, 21);
    context.lineTo(27, 15);
    context.lineTo(32, 15);
    context.lineTo(32, 21);
    context.moveTo(21, 35);
    context.arc(24, 35, 3, Math.PI, 0);
    context.stroke();
  } else if (category === 'leisure') {
    context.beginPath();
    context.arc(18, 18, 4, 0, Math.PI * 2);
    context.moveTo(21, 21);
    context.lineTo(33, 33);
    context.moveTo(26, 24);
    context.lineTo(34, 16);
    context.stroke();
  } else if (category === 'visitor') {
    // Visitor places are commonly wayfinding boards rather than abstract
    // information points. Draw the OSM subtype so a map board or guidepost is
    // recognisable at a glance instead of looking like a blue square.
    if (variant === 'guidepost') {
      context.beginPath();
      context.moveTo(24, 9);
      context.lineTo(24, 38);
      context.moveTo(24, 14);
      context.lineTo(11, 20);
      context.lineTo(24, 24);
      context.moveTo(24, 17);
      context.lineTo(37, 12);
      context.lineTo(24, 27);
      context.stroke();
    } else {
      context.beginPath();
      context.roundRect(11, 9, 26, 20, 3);
      context.moveTo(24, 29);
      context.lineTo(24, 38);
      context.moveTo(17, 38);
      context.lineTo(31, 38);
      if (variant === 'map-board') {
        context.moveTo(16, 14);
        context.lineTo(22, 18);
        context.lineTo(28, 14);
        context.lineTo(33, 19);
        context.moveTo(22, 12);
        context.lineTo(22, 25);
        context.moveTo(28, 12);
        context.lineTo(28, 25);
      } else {
        context.moveTo(24, 17);
        context.lineTo(24, 24);
      }
      context.stroke();
      if (variant !== 'map-board') {
        context.beginPath();
        context.arc(24, 14, 1.8, 0, Math.PI * 2);
        context.fillStyle = '#fff';
        context.fill();
      }
    }
  } else if (category === 'amenities') {
    context.beginPath();
    context.moveTo(24, 10);
    context.bezierCurveTo(17, 19, 16, 24, 16, 28);
    context.arc(24, 28, 8, 0, Math.PI);
    context.bezierCurveTo(32, 24, 31, 19, 24, 10);
    context.stroke();
  } else if (category === 'parking') {
    context.fillStyle = '#fff';
    context.font = '700 27px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(variant === 'parking' ? 'P' : 'P', 24, 24);
  } else {
    context.beginPath();
    context.moveTo(11, 33);
    context.lineTo(21, 17);
    context.lineTo(27, 25);
    context.lineTo(33, 15);
    context.lineTo(39, 33);
    context.moveTo(9, 34);
    context.lineTo(40, 34);
    context.stroke();
  }
  return context.getImageData(0, 0, size, size);
}

function isCuratedHesDesignation(feature: PublicFeature): boolean {
  return feature.id.startsWith('hes-');
}

function matchesFeatureQuery(feature: PublicFeature, query: string): boolean {
  const searchable = `${feature.name} ${feature.alternativeNames.join(' ')} ${feature.featureType} ${feature.tags.join(' ')}`;
  return searchable.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function isPublicArtFeature(feature: PublicFeature): boolean {
  return feature.tags.includes('public-art') || /public.?art/i.test(feature.featureType);
}

function isPlaqueOrMemorialFeature(feature: PublicFeature): boolean {
  return (
    feature.tags.includes('plaque') ||
    feature.tags.includes('community-memorial') ||
    feature.featureType === 'plaque' ||
    /plaque|memorial|gravestone/i.test(feature.featureType) ||
    feature.featureType === 'memorial' ||
    feature.featureType === 'war_memorial'
  );
}

function isCurrentContextFeature(feature: PublicFeature): boolean {
  return feature.tags.includes('current-context');
}

function matchesCommunityLayers(
  feature: PublicFeature,
  showPublicArt: boolean,
  showPlaquesAndMemorials: boolean,
): boolean {
  const isPublicArt = isPublicArtFeature(feature);
  const isPlaqueOrMemorial = isPlaqueOrMemorialFeature(feature);
  return (!isPublicArt || showPublicArt) && (!isPlaqueOrMemorial || showPlaquesAndMemorials);
}

function isVisibleFeature(
  feature: PublicFeature,
  year: number,
  includePossible: boolean,
  excludeUndated: boolean,
  query: string,
  includeDemolished: boolean,
  hideCuratedHesDesignations: boolean,
  showPublicArt: boolean,
  showPlaquesAndMemorials: boolean,
  showCurrentContext: boolean,
  archaeologyOnly: boolean,
  communityLayersOnly: boolean,
): boolean {
  const state = featureTimelineState(feature, year);
  const isPresentDayCommunityLayer =
    (showPublicArt && isPublicArtFeature(feature)) ||
    (showPlaquesAndMemorials && isPlaqueOrMemorialFeature(feature));
  const isPresentDayContextLayer = showCurrentContext && isCurrentContextFeature(feature);
  return (
    !isOsmCommunityPlace(feature) &&
    matchesFeatureQuery(feature, query) &&
    matchesCommunityLayers(feature, showPublicArt, showPlaquesAndMemorials) &&
    (!communityLayersOnly || isPresentDayCommunityLayer) &&
    isPublicTownFeature(feature) &&
    !isMapCatalogueRecord(feature) &&
    (!archaeologyOnly || isArchaeologyEvidenceFeature(feature)) &&
    (!hideCuratedHesDesignations || !isCuratedHesDesignation(feature)) &&
    (!excludeUndated || hasHistoricTimelineDate(feature)) &&
    (includeDemolished || feature.survival !== 'site_only_or_demolished') &&
    (isPresentDayCommunityLayer ||
      isPresentDayContextLayer ||
      state === 'definite' ||
      (includePossible && state === 'possible'))
  );
}

function mapOsmCommunityPlaces(
  features: PublicFeature[],
  showFood: boolean,
  showPicnic: boolean,
  showArt: boolean,
  showMemorials: boolean,
  showHistoricPlaces: boolean,
  showLeisure: boolean,
  showVisitor: boolean,
  showAmenities: boolean,
  showParking: boolean,
  showNature: boolean,
) {
  const visibleCategories: Record<OsmCommunityCategory, boolean> = {
    food: showFood,
    picnic: showPicnic,
    art: showArt,
    memorial: showMemorials,
    historic: showHistoricPlaces,
    leisure: showLeisure,
    visitor: showVisitor,
    amenities: showAmenities,
    parking: showParking,
    nature: showNature,
  };
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter((feature): feature is PublicFeature & { geometry: Point } => {
        const category = osmCommunityCategory(feature);
        return (
          feature.geometry?.type === 'Point' &&
          !feature.tags.includes('map-hidden') &&
          isPublicTownFeature(feature) &&
          Boolean(category && visibleCategories[category])
        );
      })
      .map((feature) => ({
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: feature.id,
          name: feature.name,
          markerIcon: osmCommunityMarker(feature)?.variant,
          markerCategory: osmCommunityCategory(feature),
        },
      })),
  };
}

function mapFeatures(
  features: PublicFeature[],
  year: number,
  includePossible: boolean,
  excludeUndated: boolean,
  query: string,
  includeDemolished: boolean,
  hideCuratedHesDesignations: boolean,
  showPublicArt: boolean,
  showPlaquesAndMemorials: boolean,
  showCurrentContext: boolean,
  archaeologyOnly: boolean,
  communityLayersOnly: boolean,
  methodology: ScoringMethodology,
) {
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter((feature): feature is PublicFeature & { geometry: Point } => {
        return (
          feature.geometry?.type === 'Point' &&
          isVisibleFeature(
            feature,
            year,
            includePossible,
            excludeUndated,
            query,
            includeDemolished,
            hideCuratedHesDesignations,
            showPublicArt,
            showPlaquesAndMemorials,
            showCurrentContext,
            archaeologyOnly,
            communityLayersOnly,
          )
        );
      })
      .flatMap((feature) => {
        const locations = [feature.geometry, ...(feature.additionalPointLocations ?? [])];
        // Several HES point locations can belong to one statutory designation
        // (for example the separate wings of a hospital). Render each official
        // location while keeping one inspector record and one total heat score.
        return locations.map((geometry) => ({
          type: 'Feature' as const,
          geometry,
          properties: {
            id: feature.id,
            name: feature.name,
            state: featureTimelineState(feature, year),
            score: historicCharacterScore(feature, methodology) / locations.length,
            earliestEvidenceCentury: historicEvidenceCentury(feature),
            historicDotColour: historicDotColour(feature),
          },
        }));
      }),
  };
}

function mapPolygons(
  features: PublicFeature[],
  year: number,
  includePossible: boolean,
  excludeUndated: boolean,
  query: string,
  includeDemolished: boolean,
  hideCuratedHesDesignations: boolean,
  showPublicArt: boolean,
  showPlaquesAndMemorials: boolean,
  showCurrentContext: boolean,
  archaeologyOnly: boolean,
  communityLayersOnly: boolean,
) {
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter((feature): feature is PublicFeature & { geometry: Polygon | MultiPolygon } => {
        return (
          (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') &&
          isVisibleFeature(
            feature,
            year,
            includePossible,
            excludeUndated,
            query,
            includeDemolished,
            hideCuratedHesDesignations,
            showPublicArt,
            showPlaquesAndMemorials,
            showCurrentContext,
            archaeologyOnly,
            communityLayersOnly,
          )
        );
      })
      .map((feature) => ({
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: feature.id,
          name: feature.name,
          state: featureTimelineState(feature, year),
          designationType: feature.designationType,
        },
      })),
  };
}

function mapLines(
  features: PublicFeature[],
  year: number,
  includePossible: boolean,
  excludeUndated: boolean,
  query: string,
  includeDemolished: boolean,
  hideCuratedHesDesignations: boolean,
  showPublicArt: boolean,
  showPlaquesAndMemorials: boolean,
  showCurrentContext: boolean,
  archaeologyOnly: boolean,
  communityLayersOnly: boolean,
) {
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter((feature): feature is PublicFeature & { geometry: LineString } => {
        return (
          feature.geometry?.type === 'LineString' &&
          isVisibleFeature(
            feature,
            year,
            includePossible,
            excludeUndated,
            query,
            includeDemolished,
            hideCuratedHesDesignations,
            showPublicArt,
            showPlaquesAndMemorials,
            showCurrentContext,
            archaeologyOnly,
            communityLayersOnly,
          )
        );
      })
      .map((feature) => ({
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: feature.id,
          name: feature.name,
          state: featureTimelineState(feature, year),
        },
      })),
  };
}

function mapSettlementAge(polygons: PublicSettlementPolygon[], year: number) {
  return {
    type: 'FeatureCollection' as const,
    features: polygons
      .filter((polygon) => !polygon.earliestEvidenceYear || polygon.earliestEvidenceYear <= year)
      .map((polygon) => ({
        type: 'Feature' as const,
        geometry: polygon.geometry,
        properties: { id: polygon.id, category: polygon.category, confidence: polygon.confidence },
      })),
  };
}

function resolvedTileUrl(tileUrl: string): string | undefined {
  const localTileServer = import.meta.env.VITE_HISTORIC_TILE_SERVER_URL;
  if (tileUrl.includes('{VITE_HISTORIC_TILE_SERVER_URL}') && !localTileServer) return undefined;
  return tileUrl.replace('{VITE_HISTORIC_TILE_SERVER_URL}', localTileServer ?? '');
}

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const pkg = useLoadedProjectPackage();
  const year = useExplorerStore((state) => state.selectedYear);
  const possible = useExplorerStore((state) => state.possible);
  const excludeUndated = useExplorerStore((state) => state.excludeUndated);
  const query = useExplorerStore((state) => state.query);
  const demolished = useExplorerStore((state) => state.demolished);
  const showHesDesignations = useExplorerStore((state) => state.showHesDesignations);
  const showPublicArt = useExplorerStore((state) => state.showPublicArt);
  const showPlaquesAndMemorials = useExplorerStore((state) => state.showPlaquesAndMemorials);
  const showCurrentContext = useExplorerStore((state) => state.showCurrentContext);
  const showOsmFood = useExplorerStore((state) => state.showOsmFood);
  const showOsmPicnic = useExplorerStore((state) => state.showOsmPicnic);
  const showOsmArt = useExplorerStore((state) => state.showOsmArt);
  const showOsmMemorials = useExplorerStore((state) => state.showOsmMemorials);
  const showOsmHistoricPlaces = useExplorerStore((state) => state.showOsmHistoricPlaces);
  const showOsmLeisure = useExplorerStore((state) => state.showOsmLeisure);
  const showOsmVisitor = useExplorerStore((state) => state.showOsmVisitor);
  const showOsmAmenities = useExplorerStore((state) => state.showOsmAmenities);
  const showOsmParking = useExplorerStore((state) => state.showOsmParking);
  const showOsmNature = useExplorerStore((state) => state.showOsmNature);
  const showHistoricLegend = useExplorerStore((state) => state.showHistoricLegend);
  const showOsmLegend = useExplorerStore((state) => state.showOsmLegend);
  const archaeologyOnly = useExplorerStore((state) => state.archaeologyOnly);
  const communityLayersOnly = useExplorerStore((state) => state.communityLayersOnly);
  const settlementAge = useExplorerStore((state) => state.settlementAge);
  const showAreaPolygons = useExplorerStore((state) => state.showAreaPolygons);
  const select = useExplorerStore((state) => state.selectFeature);
  const activeMap = useExplorerStore((state) => state.activeMap);
  const visibleData = mapFeatures(
    pkg.features,
    year,
    possible,
    excludeUndated,
    query,
    demolished,
    showHesDesignations,
    showPublicArt,
    showPlaquesAndMemorials,
    showCurrentContext,
    archaeologyOnly,
    communityLayersOnly,
    pkg.project.methodology,
  );
  const visiblePolygons = mapPolygons(
    pkg.features,
    year,
    possible,
    excludeUndated,
    query,
    demolished,
    showHesDesignations,
    showPublicArt,
    showPlaquesAndMemorials,
    showCurrentContext,
    archaeologyOnly,
    communityLayersOnly,
  );
  const visibleLines = mapLines(
    pkg.features,
    year,
    possible,
    excludeUndated,
    query,
    demolished,
    showHesDesignations,
    showPublicArt,
    showPlaquesAndMemorials,
    showCurrentContext,
    archaeologyOnly,
    communityLayersOnly,
  );
  const visibleSettlementAge = communityLayersOnly
    ? mapSettlementAge([], year)
    : mapSettlementAge(pkg.settlementPolygons, year);
  const visibleOsmCommunityPlaces = mapOsmCommunityPlaces(
    pkg.features,
    showOsmFood,
    showOsmPicnic,
    showOsmArt,
    showOsmMemorials,
    showOsmHistoricPlaces,
    showOsmLeisure,
    showOsmVisitor,
    showOsmAmenities,
    showOsmParking,
    showOsmNature,
  );
  const visibleDataRef = useRef(visibleData);
  const visiblePolygonsRef = useRef(visiblePolygons);
  const visibleLinesRef = useRef(visibleLines);
  const visibleSettlementAgeRef = useRef(visibleSettlementAge);
  const visibleOsmCommunityPlacesRef = useRef(visibleOsmCommunityPlaces);
  const settlementAgeRef = useRef(settlementAge);
  const featuresRef = useRef(pkg.features);
  const selectRef = useRef(select);
  visibleDataRef.current = visibleData;
  visiblePolygonsRef.current = visiblePolygons;
  visibleLinesRef.current = visibleLines;
  visibleSettlementAgeRef.current = visibleSettlementAge;
  visibleOsmCommunityPlacesRef.current = visibleOsmCommunityPlaces;
  settlementAgeRef.current = settlementAge;
  featuresRef.current = pkg.features;
  selectRef.current = select;
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: import.meta.env.VITE_MAP_STYLE_URL || openStreetMapFallbackStyle,
      center: pkg.project.centre,
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.on('error', (event) => {
      const sourceId = (event as unknown as { sourceId?: string }).sourceId;
      if (sourceId === 'historic-overlay') {
        setOverlayError(
          'The selected historic map could not be loaded. Try another layer or refresh the map.',
        );
      }
      if (sourceId === 'hes-designations-overlay') {
        setOverlayError(
          'The live HES designations overlay could not be loaded. Try again shortly.',
        );
      }
    });
    map.on('load', () => {
      map.addSource('project-boundary', { type: 'geojson', data: pkg.project.boundary });
      map.addLayer({
        id: 'project-boundary-fill',
        type: 'fill',
        source: 'project-boundary',
        paint: { 'fill-color': '#0d5c63', 'fill-opacity': 0.08 },
      });
      for (const feature of pkg.features) {
        const marker = osmCommunityMarker(feature);
        if (!marker) continue;
        const imageId = `osm-community-${marker.category}-${marker.variant}-icon`;
        if (!map.hasImage(imageId))
          map.addImage(
            imageId,
            communityMarkerImage(marker.category, marker.colour, marker.variant),
            { pixelRatio: 2 },
          );
      }
      map.addSource('osm-community-places', {
        type: 'geojson',
        data: visibleOsmCommunityPlacesRef.current,
      });
      map.addLayer({
        id: 'project-boundary-line',
        type: 'line',
        source: 'project-boundary',
        paint: { 'line-color': '#0d5c63', 'line-width': 2 },
      });
      map.addSource('settlement-age', { type: 'geojson', data: visibleSettlementAgeRef.current });
      map.addLayer({
        id: 'settlement-age-fill',
        type: 'fill',
        source: 'settlement-age',
        layout: { visibility: settlementAgeRef.current ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'match',
            ['get', 'category'],
            'developed_by_1700',
            '#7a3e2c',
            'developed_by_1800',
            '#a65f38',
            'developed_by_1850',
            '#c9904b',
            'developed_by_1900',
            '#d4b86c',
            '#93a58d',
          ],
          'fill-opacity': 0.24,
        },
      });
      map.addLayer({
        id: 'settlement-age-line',
        type: 'line',
        source: 'settlement-age',
        layout: { visibility: settlementAgeRef.current ? 'visible' : 'none' },
        paint: { 'line-color': '#5c513c', 'line-width': 1.5, 'line-opacity': 0.8 },
      });
      map.addSource('heritage-features', {
        type: 'geojson',
        data: visibleDataRef.current,
      });
      map.addLayer({
        id: 'historic-character-heatmap',
        type: 'heatmap',
        source: 'heritage-features',
        maxzoom: 17,
        paint: {
          'heatmap-weight': ['get', 'score'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 15, 2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 15, 45],
          'heatmap-opacity': 0.72,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.2,
            '#f1e3a3',
            0.45,
            '#e9a552',
            0.7,
            '#cc5b24',
            1,
            '#772f1f',
          ],
        },
      });
      map.addLayer({
        id: 'heritage-features',
        type: 'circle',
        source: 'heritage-features',
        // Keep the heat layer useful at overview scale, but expose individual
        // source-backed features at a normal town-scale zoom without bringing
        // back the numbered cluster markers.
        minzoom: 13,
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'historicDotColour'],
          'circle-opacity': ['match', ['get', 'state'], 'definite', 0.95, 0.65],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });
      map.addSource('heritage-polygons', {
        type: 'geojson',
        data: visiblePolygonsRef.current,
      });
      map.addLayer(
        {
          id: 'heritage-polygons-fill',
          type: 'fill',
          source: 'heritage-polygons',
          paint: {
            'fill-color': ['match', ['get', 'state'], 'definite', '#176b87', '#4e8fa8'],
            'fill-opacity': 0.22,
          },
        },
        'heritage-features',
      );
      map.addLayer(
        {
          id: 'heritage-polygons-line',
          type: 'line',
          source: 'heritage-polygons',
          paint: { 'line-color': '#12536b', 'line-width': 2 },
        },
        'heritage-features',
      );
      map.addSource('heritage-lines', { type: 'geojson', data: visibleLinesRef.current });
      map.addLayer({
        id: 'heritage-lines',
        type: 'line',
        source: 'heritage-lines',
        paint: {
          'line-color': ['match', ['get', 'state'], 'definite', '#714b22', '#a87931'],
          'line-width': 5,
          'line-opacity': 0.82,
        },
      });
      // This optional present-day layer stays above the historic heat map and
      // feature circles, so its category-specific symbols remain legible.
      map.addLayer({
        id: 'osm-community-places',
        type: 'symbol',
        source: 'osm-community-places',
        minzoom: 13,
        layout: {
          'icon-image': [
            'concat',
            'osm-community-',
            ['get', 'markerCategory'],
            '-',
            ['get', 'markerIcon'],
            '-icon',
          ],
          // The source image is rendered at a high pixel ratio; 0.8 produces
          // a clearly readable 19px on-map symbol.
          'icon-size': 0.8,
          // Current-place icons must not disappear behind base-map labels or
          // one another. Their smaller size limits visual crowding instead.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      map.on('click', 'heritage-features', (event) => {
        const id = event.features?.[0]?.properties?.id;
        selectRef.current(featuresRef.current.find((feature) => feature.id === id));
      });
      map.on('click', 'osm-community-places', (event) => {
        const id = event.features?.[0]?.properties?.id;
        selectRef.current(featuresRef.current.find((feature) => feature.id === id));
      });
      // Evidence/designation fills are intentionally non-interactive, so they
      // never replace a point selection where the two overlap.
      map.on('click', 'heritage-lines', (event) => {
        const id = event.features?.[0]?.properties?.id;
        selectRef.current(featuresRef.current.find((feature) => feature.id === id));
      });
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [pkg.project, pkg.features]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('heritage-features') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(visibleData);
  }, [visibleData]);
  useEffect(() => {
    const source = mapRef.current?.getSource('osm-community-places') as
      maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(visibleOsmCommunityPlaces);
  }, [visibleOsmCommunityPlaces]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('heritage-polygons') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(visiblePolygons);
  }, [visiblePolygons]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('heritage-lines') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(visibleLines);
  }, [visibleLines]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('settlement-age') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(visibleSettlementAge);
  }, [visibleSettlementAge]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const boundarySource = map.getSource('project-boundary') as
      maplibregl.GeoJSONSource | undefined;
    boundarySource?.setData(pkg.project.boundary);
    const target = { center: pkg.project.centre, zoom: 13 };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.jumpTo(target);
    else map.flyTo(target);
  }, [pkg.project.id, pkg.project.centre, pkg.project.boundary, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of ['settlement-age-fill', 'settlement-age-line']) {
      if (map.getLayer(layer))
        map.setLayoutProperty(layer, 'visibility', settlementAge ? 'visible' : 'none');
    }
  }, [settlementAge, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const layer of ['heritage-polygons-fill', 'heritage-polygons-line']) {
      if (map.getLayer(layer))
        map.setLayoutProperty(layer, 'visibility', showAreaPolygons ? 'visible' : 'none');
    }
  }, [showAreaPolygons, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const applyLayer = () => {
      setOverlayError(null);
      if (map.getLayer('historic-overlay')) map.removeLayer('historic-overlay');
      if (map.getSource('historic-overlay')) map.removeSource('historic-overlay');
      const tileUrl = activeMap?.tileUrl && resolvedTileUrl(activeMap.tileUrl);
      if (activeMap?.id === hesDesignationsLayerId) return;
      if (
        activeMap?.layerType !== 'xyz' &&
        activeMap?.layerType !== 'wms' &&
        activeMap?.layerType !== 'georeferenced_raster_tiles'
      )
        return;
      if (!tileUrl) {
        setOverlayError('This historic map package is not installed on the local tile server.');
        return;
      }
      map.addSource('historic-overlay', { type: 'raster', tiles: [tileUrl], tileSize: 256 });
      map.addLayer({
        id: 'historic-overlay',
        type: 'raster',
        source: 'historic-overlay',
        paint: { 'raster-opacity': activeMap.opacity },
      });
    };
    applyLayer();
  }, [activeMap, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('hes-designations-overlay')) map.removeLayer('hes-designations-overlay');
    if (map.getSource('hes-designations-overlay')) map.removeSource('hes-designations-overlay');
    if (!showHesDesignations || communityLayersOnly) return;

    const hesLayer = pkg.historicMaps.find((mapLayer) => mapLayer.id === hesDesignationsLayerId);
    const tileUrl = hesLayer?.tileUrl && resolvedTileUrl(hesLayer.tileUrl);
    if (!tileUrl) {
      return;
    }
    setOverlayError(null);
    map.addSource('hes-designations-overlay', { type: 'raster', tiles: [tileUrl], tileSize: 256 });
    map.addLayer(
      {
        id: 'hes-designations-overlay',
        type: 'raster',
        source: 'hes-designations-overlay',
        paint: { 'raster-opacity': hesLayer.opacity },
      },
      'historic-character-heatmap',
    );
  }, [pkg.historicMaps, showHesDesignations, communityLayersOnly, mapReady]);
  const attribution = mapAttribution(import.meta.env.VITE_MAP_ATTRIBUTION);
  return (
    <section className="map-wrap" aria-labelledby="map-heading">
      <h2 className="visually-hidden" id="map-heading">
        Historic map
      </h2>
      <p className="visually-hidden" id="map-alternative">
        The map is optional. Browse places and open their details from the Places list.
      </p>
      <div ref={container} className="map" aria-describedby="map-alternative" />
      <div className="attribution">
        {attribution.provider && <span>{attribution.provider} · </span>}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {attribution.openStreetMap}
        </a>
      </div>
      {(showHistoricLegend || showHesDesignations || showOsmLegend) && (
        <aside className="map-legend" aria-label="Map key">
          {showHistoricLegend && (
            <section>
              <h2>Historic dots</h2>
              <p>Earliest evidence century</p>
              <ul className="legend-list historic-legend-list">
                <li>
                  <span className="legend-dot age-pre1000" />
                  Before 1000
                </li>
                <li>
                  <span className="legend-dot age-1000" />
                  1000–1199
                </li>
                <li>
                  <span className="legend-dot age-1200" />
                  1200–1399
                </li>
                <li>
                  <span className="legend-dot age-1400" />
                  1400–1599
                </li>
                <li>
                  <span className="legend-dot age-1600" />
                  1600–1799
                </li>
                <li>
                  <span className="legend-dot age-1800" />
                  1800–1899
                </li>
                <li>
                  <span className="legend-dot age-1900" />
                  1900 onwards
                </li>
                <li>
                  <span className="legend-dot age-unknown" />
                  No numeric evidence year
                </li>
              </ul>
            </section>
          )}
          {showHesDesignations && (
            <section className="hes-legend-section">
              <h2>Live HES designations</h2>
              <p>
                <span className="hes-legend-dot" aria-hidden="true" /> Dark and category symbols are
                from the current HES statutory overlay, not the historic-dot scale.
              </p>
              <p>Turn off “Show current HES designations” in Settings to hide them.</p>
            </section>
          )}
          {showOsmLegend && (
            <section
              className={
                showHistoricLegend || showHesDesignations ? 'osm-legend-section' : undefined
              }
            >
              <h2>Current OSM places</h2>
              <p>Optional present-day context</p>
              <ul className="legend-list osm-legend-list">
                <li>
                  <span className="osm-legend-icon food" aria-hidden="true">
                    ☕
                  </span>
                  Food &amp; drink
                </li>
                <li>
                  <span className="osm-legend-icon picnic" aria-hidden="true">
                    ▰
                  </span>
                  Picnic &amp; rest
                </li>
                <li>
                  <span className="osm-legend-icon art" aria-hidden="true">
                    ✦
                  </span>
                  Art &amp; culture
                </li>
                <li>
                  <span className="osm-legend-icon memorial" aria-hidden="true">
                    ▤
                  </span>
                  Memorials &amp; plaques
                </li>
                <li>
                  <span className="osm-legend-icon historic" aria-hidden="true">
                    ⌂
                  </span>
                  Historic places
                </li>
                <li>
                  <span className="osm-legend-icon leisure" aria-hidden="true">
                    ◉
                  </span>
                  Leisure
                </li>
                <li>
                  <span className="osm-legend-icon visitor" aria-hidden="true">
                    ▣
                  </span>
                  Visitor information
                </li>
                <li>
                  <span className="osm-legend-icon amenities" aria-hidden="true">
                    ●
                  </span>
                  Amenities
                </li>
                <li>
                  <span className="osm-legend-icon parking" aria-hidden="true">
                    P
                  </span>
                  Parking
                </li>
                <li>
                  <span className="osm-legend-icon nature" aria-hidden="true">
                    △
                  </span>
                  Natural sights
                </li>
              </ul>
            </section>
          )}
        </aside>
      )}
      {overlayError && (
        <p className="map-overlay-error" role="status">
          {overlayError}
        </p>
      )}
    </section>
  );
}
