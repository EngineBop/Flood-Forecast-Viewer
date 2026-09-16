import * as maplibregl from "https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.mjs";

const els = {
  loading: document.querySelector("#loading"),
  validTime: document.querySelector("#valid-time"),
  leadTime: document.querySelector("#lead-time"),
  frameMax: document.querySelector("#frame-max"),
  slider: document.querySelector("#time-slider"),
  play: document.querySelector("#play-button"),
  previous: document.querySelector("#previous-button"),
  next: document.querySelector("#next-button"),
  speed: document.querySelector("#speed-select"),
  timelineStart: document.querySelector("#timeline-start"),
  timelineCurrent: document.querySelector("#timeline-current"),
  timelineEnd: document.querySelector("#timeline-end"),
  layersButton: document.querySelector("#layers-button"),
  closeLayers: document.querySelector("#close-layers"),
  layersPanel: document.querySelector("#layers-panel"),
  rainToggle: document.querySelector("#rain-toggle"),
  catchmentToggle: document.querySelector("#catchment-toggle"),
  labelToggle: document.querySelector("#label-toggle"),
  opacity: document.querySelector("#opacity-slider"),
  opacityOutput: document.querySelector("#opacity-output"),
};

const state = {
  forecast: null,
  index: 0,
  playing: false,
  timer: null,
  activeLayer: "rain-a",
  opacity: 1,
  mapReady: false,
  valuesCache: new Map(),
};

const style = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Imagery © Esri and contributors",
    },
    streets: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
    labels: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Labels © Esri",
    },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
  ],
};

const map = new maplibregl.Map({
  container: "map",
  style,
  center: [176.75, -38.1],
  zoom: 6.25,
  minZoom: 4,
  maxZoom: 13,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const shortFormatter = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(iso, short = false) {
  return (short ? shortFormatter : dateFormatter).format(new Date(iso));
}

function frameImageUrl(frame) {
  return `${frame.path}?v=${encodeURIComponent(state.forecast.dataVersion || "1")}`;
}

function preload(index) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const frame = state.forecast.frames[(index + offset) % state.forecast.frames.length];
    const image = new Image();
    image.src = frameImageUrl(frame);
  }
}

function setLayerOpacity(layerId, opacity) {
  if (map.getLayer(layerId)) map.setPaintProperty(layerId, "raster-opacity", opacity);
}

async function showFrame(index, { immediate = false } = {}) {
  if (!state.forecast || !state.mapReady) return;
  const total = state.forecast.frames.length;
  state.index = (index + total) % total;
  const frame = state.forecast.frames[state.index];
  const inactive = state.activeLayer === "rain-a" ? "rain-b" : "rain-a";
  const inactiveSource = map.getSource(inactive);

  if (immediate) {
    map.getSource(state.activeLayer).updateImage({ url: frameImageUrl(frame), coordinates: state.forecast.coordinates });
    setLayerOpacity(state.activeLayer, state.opacity);
    setLayerOpacity(inactive, 0);
  } else {
    inactiveSource.updateImage({ url: frameImageUrl(frame), coordinates: state.forecast.coordinates });
    setLayerOpacity(inactive, state.opacity);
    setLayerOpacity(state.activeLayer, 0);
    state.activeLayer = inactive;
  }

  els.slider.value = String(state.index);
  els.validTime.textContent = formatDate(frame.validTimeNz);
  els.leadTime.textContent = `T+${frame.leadHour}`;
  els.frameMax.textContent = `Frame max ${frame.maximumMm.toFixed(1)} mm`;
  els.timelineCurrent.textContent = `T+${frame.leadHour} · ${formatDate(frame.validTimeNz, true)}`;
  const progress = (state.index / (total - 1)) * 100;
  els.slider.style.setProperty("--progress", `${progress}%`);
  preload(state.index);
}

function stopPlayback() {
  state.playing = false;
  window.clearInterval(state.timer);
  state.timer = null;
  els.play.classList.remove("playing");
  els.play.setAttribute("aria-label", "Play forecast animation");
}

function startPlayback() {
  stopPlayback();
  state.playing = true;
  els.play.classList.add("playing");
  els.play.setAttribute("aria-label", "Pause forecast animation");
  state.timer = window.setInterval(() => showFrame(state.index + 1), Number(els.speed.value));
}

function setVisibility(layerId, visible) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function lonLatToNztm(lonDegrees, latDegrees) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lon0 = 173 * Math.PI / 180;
  const lat = latDegrees * Math.PI / 180;
  const lon = lonDegrees * Math.PI / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat ** 2);
  const t = tanLat ** 2;
  const c = ep2 * cosLat ** 2;
  const aa = cosLat * (lon - lon0);
  const m = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * lat)
  );
  const easting = 1600000 + k0 * n * (
    aa + (1 - t + c) * aa ** 3 / 6
    + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5 / 120
  );
  const northing = 10000000 + k0 * (
    m + n * tanLat * (
      aa ** 2 / 2
      + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24
      + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6 / 720
    )
  );
  return [easting, northing];
}

async function loadFrameValues(index) {
  if (state.valuesCache.has(index)) return state.valuesCache.get(index);
  const response = await fetch(state.forecast.frames[index].valuesPath);
  if (!response.ok) throw new Error("Rainfall values could not be loaded");
  const values = new Uint16Array(await response.arrayBuffer());
  state.valuesCache.set(index, values);
  if (state.valuesCache.size > 8) {
    const firstKey = state.valuesCache.keys().next().value;
    state.valuesCache.delete(firstKey);
  }
  return values;
}

function buildRainfallPopup(value, frame) {
  const container = document.createElement("div");
  container.className = "rainfall-popup";
  const label = document.createElement("span");
  label.textContent = "Cumulative rainfall";
  const reading = document.createElement("strong");
  reading.textContent = `${value.toFixed(1)} mm`;
  const time = document.createElement("small");
  time.textContent = `Valid ${formatDate(frame.validTimeNz)}`;
  container.append(label, reading, time);
  return container;
}

map.on("click", async (event) => {
  if (!state.forecast || !els.rainToggle.checked) return;
  const grid = state.forecast.grid;
  const [easting, northing] = lonLatToNztm(event.lngLat.lng, event.lngLat.lat);
  const column = Math.floor((easting - grid.xMin) / grid.cellSize);
  const row = Math.floor((grid.yMax - northing) / grid.cellSize);
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) return;
  const frameIndex = state.index;
  const frame = state.forecast.frames[frameIndex];
  try {
    const values = await loadFrameValues(frameIndex);
    const encoded = values[row * grid.width + column];
    if (encoded === grid.noDataCode) return;
    const value = encoded / grid.valueScale;
    new maplibregl.Popup({ closeButton: true, maxWidth: "260px", offset: 12 })
      .setLngLat(event.lngLat)
      .setDOMContent(buildRainfallPopup(value, frame))
      .addTo(map);
  } catch (error) {
    console.warn("Rainfall query failed", error);
  }
});

async function addCatchments() {
  const url = "https://gis.boprc.govt.nz/server2/rest/services/BayOfPlentyMaps/Environment/MapServer/170/query?where=1%3D1&outFields=Catchment%2CPrimaryCatchment&returnGeometry=true&outSR=4326&f=geojson";
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Catchment request failed: ${response.status}`);
    const geojson = await response.json();
    map.addSource("catchments", { type: "geojson", data: geojson });
    map.addLayer({
      id: "catchment-shadow",
      type: "line",
      source: "catchments",
      paint: { "line-color": "rgba(0, 0, 0, .7)", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 3] },
    });
    map.addLayer({
      id: "catchments",
      type: "line",
      source: "catchments",
      paint: { "line-color": "rgba(255, 255, 255, .83)", "line-width": ["interpolate", ["linear"], ["zoom"], 5, .55, 10, 1.35] },
    });
  } catch (error) {
    console.warn("Catchment layer unavailable", error);
    els.catchmentToggle.checked = false;
    els.catchmentToggle.disabled = true;
  }
}

async function initialise() {
  const response = await fetch("assets/forecast.json");
  if (!response.ok) throw new Error("Forecast manifest could not be loaded");
  state.forecast = await response.json();
  els.slider.max = String(state.forecast.frames.length - 1);
  els.timelineStart.textContent = formatDate(state.forecast.frames[0].validTimeNz, true);
  els.timelineEnd.textContent = formatDate(state.forecast.frames.at(-1).validTimeNz, true);

  await new Promise((resolve) => map.once("load", resolve));
  state.mapReady = true;

  for (const id of ["rain-a", "rain-b"]) {
    map.addSource(id, {
      type: "image",
      url: frameImageUrl(state.forecast.frames[0]),
      coordinates: state.forecast.coordinates,
    });
    map.addLayer({
      id,
      type: "raster",
      source: id,
      paint: {
        "raster-opacity": id === "rain-a" ? state.opacity : 0,
        "raster-resampling": "linear",
        "raster-fade-duration": 190,
        "raster-opacity-transition": { duration: 190 },
      },
    });
  }

  await addCatchments();
  map.addLayer({ id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.92 } });
  map.fitBounds([[175.05, -39.55], [178.75, -36.75]], { padding: { top: 95, bottom: 100, left: 40, right: 40 }, duration: 0 });
  await showFrame(0, { immediate: true });
  els.loading.classList.add("done");
}

els.play.addEventListener("click", () => (state.playing ? stopPlayback() : startPlayback()));
els.previous.addEventListener("click", () => { stopPlayback(); showFrame(state.index - 1); });
els.next.addEventListener("click", () => { stopPlayback(); showFrame(state.index + 1); });
els.slider.addEventListener("input", (event) => { stopPlayback(); showFrame(Number(event.target.value)); });
els.speed.addEventListener("change", () => { if (state.playing) startPlayback(); });
els.layersButton.addEventListener("click", () => {
  const hidden = els.layersPanel.classList.toggle("hidden");
  els.layersButton.setAttribute("aria-expanded", String(!hidden));
});
els.closeLayers.addEventListener("click", () => {
  els.layersPanel.classList.add("hidden");
  els.layersButton.setAttribute("aria-expanded", "false");
});
els.rainToggle.addEventListener("change", (event) => {
  setVisibility("rain-a", event.target.checked);
  setVisibility("rain-b", event.target.checked);
});
els.catchmentToggle.addEventListener("change", (event) => {
  setVisibility("catchments", event.target.checked);
  setVisibility("catchment-shadow", event.target.checked);
});
els.labelToggle.addEventListener("change", (event) => setVisibility("labels", event.target.checked));
els.opacity.addEventListener("input", (event) => {
  state.opacity = Number(event.target.value) / 100;
  els.opacityOutput.value = `${event.target.value}%`;
  setLayerOpacity(state.activeLayer, state.opacity);
});
document.querySelectorAll("[data-basemap]").forEach((button) => {
  button.addEventListener("click", () => {
    const imagery = button.dataset.basemap === "imagery";
    setVisibility("imagery", imagery);
    setVisibility("streets", !imagery);
    document.querySelectorAll("[data-basemap]").forEach((item) => item.classList.toggle("active", item === button));
  });
});
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !["INPUT", "SELECT", "BUTTON"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    state.playing ? stopPlayback() : startPlayback();
  }
  if (event.key === "ArrowLeft") { stopPlayback(); showFrame(state.index - 1); }
  if (event.key === "ArrowRight") { stopPlayback(); showFrame(state.index + 1); }
});

function registerForecastTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  Promise.resolve(context.registerTool({
    name: "set_forecast_hour",
    title: "Set forecast hour",
    description: "Move the rainfall viewer to a specific forecast lead hour from zero through eighty-four.",
    inputSchema: {
      type: "object",
      properties: { leadHour: { type: "integer", minimum: 0, maximum: 84 } },
      required: ["leadHour"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!Number.isInteger(input?.leadHour) || input.leadHour < 0 || input.leadHour > 84) {
        throw new Error("leadHour must be a whole number from 0 through 84");
      }
      stopPlayback();
      await showFrame(input.leadHour);
      return { leadHour: state.index, validTimeNz: state.forecast.frames[state.index].validTimeNz };
    },
  }, { signal: lifecycle.signal })).catch((error) => console.warn("Forecast tool registration failed", error));
}

initialise().catch((error) => {
  console.error(error);
  els.loading.querySelector("strong").textContent = "Forecast could not be loaded";
  els.loading.querySelector("small").textContent = error.message;
});
registerForecastTools();
