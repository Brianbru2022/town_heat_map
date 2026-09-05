import { useExplorerStore, useLoadedProjectPackage } from '../app/store';

export function Timeline() {
  const pkg = useLoadedProjectPackage();
  const year = useExplorerStore((state) => state.selectedYear);
  const setYear = useExplorerStore((state) => state.setYear);
  const start = pkg.project.timelineStart ?? 1700;
  const end = pkg.project.timelineEnd ?? new Date().getFullYear();
  return (
    <section className="timeline" aria-label="Timeline">
      <label>
        <span>Selected year</span>
        <output>{year}</output>
        <input
          type="range"
          min={start}
          max={end}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        />
      </label>
      <p>
        Features with uncertain dates are labelled as possibly present. Historic-map survey,
        revision, and publication dates are kept distinct.
      </p>
    </section>
  );
}
