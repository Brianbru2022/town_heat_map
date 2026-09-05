import { create } from 'zustand';
import type { HeritageFeature, HistoricMapLayer, ProjectPackage } from '../domain/models';
import {
  loadProjectCatalogue,
  loadProjectPackage,
  type PublishedProjectSummary,
} from '../data/projectClient';
import { withLocalMapReviews } from '../data/localMapReviews';
import { hasHistoricTimelineDate } from '../domain/timeline';

export type AppMode = 'explore' | 'sources' | 'methodology' | 'data-review';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type HistoryMode = 'none' | 'push' | 'replace';

const appModes = new Set<AppMode>(['explore', 'sources', 'methodology', 'data-review']);
let packageLoadSequence = 0;

function locationState(): { mode: AppMode; townId?: string } {
  if (typeof window === 'undefined') return { mode: 'explore' };
  const parameters = new URLSearchParams(window.location.search);
  const requestedMode = parameters.get('view');
  return {
    mode:
      requestedMode && appModes.has(requestedMode as AppMode)
        ? (requestedMode as AppMode)
        : 'explore',
    townId: parameters.get('town') || undefined,
  };
}

function updateLocation(townId: string | undefined, mode: AppMode, historyMode: HistoryMode): void {
  if (typeof window === 'undefined' || historyMode === 'none') return;
  const url = new URL(window.location.href);
  if (townId) url.searchParams.set('town', townId);
  else url.searchParams.delete('town');
  if (mode === 'explore') url.searchParams.delete('view');
  else url.searchParams.set('view', mode);
  window.history[historyMode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
}

function loadErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The town guide could not be loaded. Please try again.';
}

interface ExplorerState {
  package?: ProjectPackage;
  publishedProjects: PublishedProjectSummary[];
  loadStatus: LoadStatus;
  loadError?: string;
  requestedProjectId?: string;
  mode: AppMode;
  selectedFeature?: HeritageFeature;
  selectedYear: number;
  query: string;
  visibleTypes: string[];
  possible: boolean;
  settlementAge: boolean;
  showAreaPolygons: boolean;
  excludeUndated: boolean;
  demolished: boolean;
  activeMap?: HistoricMapLayer;
  showHesDesignations: boolean;
  showPublicArt: boolean;
  showPlaquesAndMemorials: boolean;
  showCurrentContext: boolean;
  showOsmFood: boolean;
  showOsmPicnic: boolean;
  showOsmArt: boolean;
  showOsmMemorials: boolean;
  showOsmHistoricPlaces: boolean;
  showOsmLeisure: boolean;
  showOsmVisitor: boolean;
  showOsmAmenities: boolean;
  showOsmParking: boolean;
  showOsmNature: boolean;
  showHistoricLegend: boolean;
  showOsmLegend: boolean;
  archaeologyOnly: boolean;
  communityLayersOnly: boolean;
  initialise(): Promise<void>;
  loadPackage(id: string, historyMode?: HistoryMode): Promise<void>;
  retryLoad(): Promise<void>;
  syncLocation(): void;
  setMode(mode: AppMode): void;
  setYear(year: number): void;
  selectFeature(feature?: HeritageFeature): void;
  setQuery(query: string): void;
  toggleType(type: string): void;
  setPossible(value: boolean): void;
  setSettlementAge(value: boolean): void;
  setShowAreaPolygons(value: boolean): void;
  setExcludeUndated(value: boolean): void;
  setDemolished(value: boolean): void;
  setActiveMap(map?: HistoricMapLayer): void;
  setShowHesDesignations(value: boolean): void;
  setShowPublicArt(value: boolean): void;
  setShowPlaquesAndMemorials(value: boolean): void;
  setShowCurrentContext(value: boolean): void;
  setShowOsmFood(value: boolean): void;
  setShowOsmPicnic(value: boolean): void;
  setShowOsmArt(value: boolean): void;
  setShowOsmMemorials(value: boolean): void;
  setShowOsmHistoricPlaces(value: boolean): void;
  setShowOsmLeisure(value: boolean): void;
  setShowOsmVisitor(value: boolean): void;
  setShowOsmAmenities(value: boolean): void;
  setShowOsmParking(value: boolean): void;
  setShowOsmNature(value: boolean): void;
  setShowHistoricLegend(value: boolean): void;
  setShowOsmLegend(value: boolean): void;
  setArchaeologyOnly(value: boolean): void;
  setCommunityLayersOnly(value: boolean): void;
}
export const useExplorerStore = create<ExplorerState>((set) => ({
  package: undefined,
  publishedProjects: [],
  loadStatus: 'idle',
  mode: locationState().mode,
  selectedYear: 1900,
  query: '',
  visibleTypes: [],
  possible: true,
  settlementAge: true,
  showAreaPolygons: true,
  excludeUndated: false,
  demolished: false,
  showHesDesignations: false,
  showPublicArt: false,
  showPlaquesAndMemorials: false,
  showCurrentContext: false,
  showOsmFood: false,
  showOsmPicnic: false,
  showOsmArt: false,
  showOsmMemorials: false,
  showOsmHistoricPlaces: false,
  showOsmLeisure: false,
  showOsmVisitor: false,
  showOsmAmenities: false,
  showOsmParking: false,
  showOsmNature: false,
  showHistoricLegend: true,
  showOsmLegend: false,
  archaeologyOnly: false,
  communityLayersOnly: false,
  initialise: async () => {
    set({ loadStatus: 'loading', loadError: undefined });
    try {
      const publishedProjects = await loadProjectCatalogue();
      const requestedTown = locationState().townId;
      const requestedProject = publishedProjects.find((project) => project.id === requestedTown);
      const selectedProject =
        requestedProject ??
        publishedProjects.find((project) => project.id === 'alloa-scotland') ??
        publishedProjects[0];
      if (!selectedProject) throw new Error('No published town guides are available.');
      set({ publishedProjects });
      await useExplorerStore
        .getState()
        .loadPackage(selectedProject.id, requestedTown && !requestedProject ? 'replace' : 'none');
    } catch (error) {
      set({ loadStatus: 'error', loadError: loadErrorMessage(error) });
    }
  },
  loadPackage: async (id, historyMode = 'push') => {
    const sequence = ++packageLoadSequence;
    set({ loadStatus: 'loading', loadError: undefined, requestedProjectId: id });
    try {
      const packageWithReviews = withLocalMapReviews(await loadProjectPackage(id));
      if (sequence !== packageLoadSequence) return;
      set({
        package: packageWithReviews,
        loadStatus: 'ready',
        loadError: undefined,
        requestedProjectId: undefined,
        selectedFeature: undefined,
        activeMap: undefined,
        showHesDesignations: false,
        showPublicArt: false,
        showPlaquesAndMemorials: false,
        showCurrentContext: false,
        showOsmFood: false,
        showOsmPicnic: false,
        showOsmArt: false,
        showOsmMemorials: false,
        showOsmHistoricPlaces: false,
        showOsmLeisure: false,
        showOsmVisitor: false,
        showOsmAmenities: false,
        showOsmParking: false,
        showOsmNature: false,
        showHistoricLegend: true,
        showOsmLegend: false,
        archaeologyOnly: false,
        communityLayersOnly: false,
        showAreaPolygons: true,
        query: '',
        visibleTypes: [],
        selectedYear: packageWithReviews.project.timelineEnd ?? new Date().getFullYear(),
      });
      updateLocation(packageWithReviews.project.id, useExplorerStore.getState().mode, historyMode);
    } catch (error) {
      if (sequence !== packageLoadSequence) return;
      set({ loadStatus: 'error', loadError: loadErrorMessage(error) });
    }
  },
  retryLoad: async () => {
    const state = useExplorerStore.getState();
    if (state.requestedProjectId) {
      await state.loadPackage(state.requestedProjectId, state.package ? 'push' : 'none');
      return;
    }
    await state.initialise();
  },
  syncLocation: () => {
    const requested = locationState();
    set({ mode: requested.mode });
    const state = useExplorerStore.getState();
    const selected = requested.townId
      ? state.publishedProjects.find((project) => project.id === requested.townId)
      : (state.publishedProjects.find((project) => project.id === 'alloa-scotland') ??
        state.publishedProjects[0]);
    if (selected && selected.id !== state.package?.project.id) {
      void state.loadPackage(selected.id, 'none');
    }
  },
  setMode: (mode) => {
    set({ mode });
    updateLocation(useExplorerStore.getState().package?.project.id, mode, 'push');
  },
  setYear: (selectedYear) => set({ selectedYear }),
  selectFeature: (selectedFeature) => set({ selectedFeature }),
  setQuery: (query) => set({ query }),
  toggleType: (type) =>
    set((state) => ({
      visibleTypes: state.visibleTypes.includes(type)
        ? state.visibleTypes.filter((item) => item !== type)
        : [...state.visibleTypes, type],
    })),
  setPossible: (possible) => set({ possible }),
  setSettlementAge: (settlementAge) => set({ settlementAge }),
  setShowAreaPolygons: (showAreaPolygons) => set({ showAreaPolygons }),
  setExcludeUndated: (excludeUndated) =>
    set((state) => ({
      excludeUndated,
      selectedFeature:
        excludeUndated && state.selectedFeature && !hasHistoricTimelineDate(state.selectedFeature)
          ? undefined
          : state.selectedFeature,
    })),
  setDemolished: (demolished) => set({ demolished }),
  setActiveMap: (activeMap) => set({ activeMap }),
  setShowHesDesignations: (showHesDesignations) => set({ showHesDesignations }),
  setShowPublicArt: (showPublicArt) => set({ showPublicArt }),
  setShowPlaquesAndMemorials: (showPlaquesAndMemorials) => set({ showPlaquesAndMemorials }),
  setShowCurrentContext: (showCurrentContext) => set({ showCurrentContext }),
  setShowOsmFood: (showOsmFood) => set({ showOsmFood }),
  setShowOsmPicnic: (showOsmPicnic) => set({ showOsmPicnic }),
  setShowOsmArt: (showOsmArt) => set({ showOsmArt }),
  setShowOsmMemorials: (showOsmMemorials) => set({ showOsmMemorials }),
  setShowOsmHistoricPlaces: (showOsmHistoricPlaces) => set({ showOsmHistoricPlaces }),
  setShowOsmLeisure: (showOsmLeisure) => set({ showOsmLeisure }),
  setShowOsmVisitor: (showOsmVisitor) => set({ showOsmVisitor }),
  setShowOsmAmenities: (showOsmAmenities) => set({ showOsmAmenities }),
  setShowOsmParking: (showOsmParking) => set({ showOsmParking }),
  setShowOsmNature: (showOsmNature) => set({ showOsmNature }),
  setShowHistoricLegend: (showHistoricLegend) => set({ showHistoricLegend }),
  setShowOsmLegend: (showOsmLegend) => set({ showOsmLegend }),
  setArchaeologyOnly: (archaeologyOnly) => set({ archaeologyOnly }),
  setCommunityLayersOnly: (communityLayersOnly) =>
    set(
      communityLayersOnly
        ? {
            communityLayersOnly,
            showPublicArt: true,
            showPlaquesAndMemorials: true,
            showOsmFood: true,
            showOsmPicnic: true,
            showOsmArt: true,
            showOsmMemorials: true,
            showOsmHistoricPlaces: true,
            showOsmLeisure: true,
            showOsmVisitor: true,
            showOsmAmenities: true,
            showOsmParking: true,
            showOsmNature: true,
          }
        : { communityLayersOnly },
    ),
}));

export function useLoadedProjectPackage(): ProjectPackage {
  const projectPackage = useExplorerStore((state) => state.package);
  if (!projectPackage)
    throw new Error('A town guide must be loaded before rendering the explorer.');
  return projectPackage;
}
