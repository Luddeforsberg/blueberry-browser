// Chart.js, pinned in package.json and inlined here at build time from node_modules, never fetched, for an HTML card that
// asks for it. MIT licensed. Its own exports don't list the UMD build, so it's reached by its path.
import chartJs from "../../node_modules/chart.js/dist/chart.umd.min.js?raw";

export const CHART_LIBRARY: string = chartJs;
