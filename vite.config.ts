import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateBasemapTileUrl } from './src/config/basemap';
import { validateMapStyleUrl } from './src/config/mapStyle';

const apiPort = process.env.TOWNSCAPE_API_PORT ?? '3001';

function hesTileExportPath(path: string): string {
  const match = path.match(/^\/api\/hes-designations\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match) return path;
  const [z, x, y] = match.slice(1).map(Number);
  const tiles = 2 ** z;
  const edge = 20_037_508.342789244;
  const size = (edge * 2) / tiles;
  const bbox = `${-edge + x * size},${edge - (y + 1) * size},${-edge + (x + 1) * size},${edge - y * size}`;
  return `/arcgis/rest/services/HES/HES_Designations/MapServer/export?${new URLSearchParams({
    bbox,
    bboxSR: '3857',
    imageSR: '3857',
    size: '256,256',
    format: 'png32',
    transparent: 'true',
    layers: 'show:0,2,5,7',
    f: 'image',
  }).toString()}`;
}

export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, process.cwd(), '');
  validateBasemapTileUrl(
    process.env.VITE_BASEMAP_TILE_URL ?? fileEnvironment.VITE_BASEMAP_TILE_URL,
    mode === 'production',
  );
  validateMapStyleUrl(process.env.VITE_MAP_STYLE_URL ?? fileEnvironment.VITE_MAP_STYLE_URL);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/hes-designations': {
          target: 'https://inspire.hes.scot',
          changeOrigin: true,
          rewrite: hesTileExportPath,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('Accept', 'image/png');
            });
          },
        },
        '/api/local-historic-maps': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
        '/api/projects': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
