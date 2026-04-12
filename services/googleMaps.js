/**
 * services/googleMaps.js
 * Standardized interface layer encapsulating the Google Maps Javascript API.
 *
 * FIXES applied vs original:
 *  1. initializeMap() shows the container THEN injects the script (not after).
 *  2. renderMap() calls google.maps.event.trigger(map,'resize') after init so
 *     Maps recalculates layout when the container was previously hidden.
 *  3. Script injection is guarded against double-loading (idempotent).
 *  4. Dark map styles match the CrowdPilot #0e0e0e background.
 *  5. renderMap is exposed so it can be called from script.onload correctly.
 */

// ---------------------------------------------------------------------------
// Configuration — replace with import.meta.env.VITE_GOOGLE_MAPS_KEY or
// process.env.GOOGLE_MAPS_API_KEY as appropriate for your bundler.
// ---------------------------------------------------------------------------
const MAPS_CONFIG = {
    apiKey: import.meta.env?.VITE_GOOGLE_MAPS_KEY
        ?? (typeof process !== 'undefined' ? process.env?.GOOGLE_MAPS_API_KEY : undefined)
        ?? 'AIzaSyARfpvIP71u0H6dplaK0CXR9b33CnVbiio', // fallback for local dev
};

// MSG default center
const DEFAULT_CENTER = { lat: 40.7505, lng: -73.9934 };
const DEFAULT_ZOOM = 18;

// Dark map style matching #0e0e0e CrowdPilot theme but keeping the stadium structure visible
const DARK_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d0d' }] },
    // Leave POIs (especially sports complexes) visible so MSG geometry appears
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#303030' }] },
];

// Singleton map instance — exported so other modules (routes.js etc.) can reuse
let _mapInstance = null;

/**
 * Validates that a Maps API key is configured.
 * @returns {Promise<boolean>}
 */
export async function hasGoogleMapsBackend() {
    return Boolean(MAPS_CONFIG.apiKey);
}

/**
 * Injects the Maps script if not already present, then renders the map into
 * containerElement. The container MUST already be visible (display !== 'none',
 * non-zero dimensions) before this function is called — the caller (map.js) is
 * responsible for ensuring that.
 *
 * @param {HTMLElement} containerElement
 */
export function initializeMap(containerElement) {
    if (!containerElement) {
        console.warn('[Google Maps] initializeMap called with null container.');
        return;
    }

    // FIX: If the Maps JS is already constructor-ready, render immediately
    if (window.google?.maps?.Map) {
        renderMap(containerElement);
        return;
    }

    // FIX: Guard against injecting the script twice (e.g. HMR / duplicate calls)
    const SCRIPT_ID = 'crowdpilot-gmaps-script';
    if (document.getElementById(SCRIPT_ID)) {
        // Script injected but callback hasn't fired yet
        const check = setInterval(() => {
            if (window.google?.maps?.Map) {
                clearInterval(check);
                renderMap(containerElement);
            }
        }, 100);
        return;
    }

    window.__CrowdPilotMapsCallback = () => {
        console.log('[Google Maps] Global callback fired — rendering map.');
        renderMap(containerElement);
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_CONFIG.apiKey}&libraries=places,visualization,marker&callback=__CrowdPilotMapsCallback`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
        console.error('[Google Maps] Script failed to load. Check your API key and network.');
    };

    document.head.appendChild(script);
    console.log('[Google Maps] Script injected.');
}

/**
 * Renders the Google Map into the container.
 * Called only after window.google.maps is confirmed available.
 *
 * @param {HTMLElement} containerElement
 */
function renderMap(containerElement) {
    if (!window.google?.maps) {
        console.error('[Google Maps] renderMap called before google.maps available.');
        return;
    }

    const map = new google.maps.Map(containerElement, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        backgroundColor: '#0e0e0e',
        // FIX: apply dark theme — without this the map renders with a white/light
        // background that flashes before tiles load, looking like a broken state.
        styles: DARK_STYLES,
        gestureHandling: 'greedy', // allow single-finger pan on mobile without scroll conflict
    });

    _mapInstance = map;

    // FIX: Force Maps to recalculate the container dimensions.
    // When a container was previously hidden (display:none), Maps caches a
    // 0×0 size. Triggering 'resize' makes it re-measure and fill correctly.
    google.maps.event.trigger(map, 'resize');
    map.setCenter(DEFAULT_CENTER); // re-center after resize

    console.log('[Google Maps] Map rendered at', DEFAULT_CENTER);
}

/**
 * Global map state trackers to allow cleanly wiping routes between filter clicks
 */
let currentHeatmapLayer = null;
let currentDirectionsRenderer = null;
let currentVectorPolyline = null;
let currentMarkers = [];

export function clearMapOverlays() {
    if (currentHeatmapLayer) currentHeatmapLayer.setMap(null);
    if (currentDirectionsRenderer) currentDirectionsRenderer.setMap(null);
    if (currentVectorPolyline) currentVectorPolyline.setMap(null);
    currentMarkers.forEach(m => m.map = null);
    
    currentMarkers = [];
    currentHeatmapLayer = null;
    currentDirectionsRenderer = null;
    currentVectorPolyline = null;
}

/**
 * Returns the active map instance, or null if not yet initialized.
 * @returns {google.maps.Map|null}
 */
export function getMapInstance() {
    return _mapInstance;
}

/**
 * Adds an AdvancedMarkerElement to the map.
 * Falls back gracefully if the marker library isn't loaded.
 *
 * @param {google.maps.Map} map
 * @param {number} lat
 * @param {number} lng
 * @param {string} title
 * @returns {google.maps.marker.AdvancedMarkerElement|null}
 */
export function addStadiumMarker(map, lat, lng, title) {
    if (!window.google?.maps?.marker?.AdvancedMarkerElement) {
        console.warn('[Google Maps] AdvancedMarkerElement not available — ensure "marker" library is loaded.');
        return null;
    }
    const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        map,
        title,
    });
    currentMarkers.push(marker);
    console.log(`[Google Maps] Marker added: "${title}" at (${lat}, ${lng})`);
    return marker;
}

/**
 * calculateWalkingRoute
 * Uses the Directions API with WALKING travel mode.
 * Respects physical barriers (walls, fences) and follows paved paths.
 *
 * @param {{ lat: number, lng: number }} startPosition
 * @param {{ lat: number, lng: number }} endPosition
 * @returns {Promise<google.maps.DirectionsResult|null>}
 */
export async function calculateWalkingRoute(startPosition, endPosition) {
    if (!window.google?.maps) {
        console.warn('[Google Maps] Maps not loaded — cannot calculate route.');
        return null;
    }
    const svc = new google.maps.DirectionsService();
    try {
        const result = await svc.route({
            origin: startPosition,
            destination: endPosition,
            travelMode: google.maps.TravelMode.WALKING,
        });
        
        currentDirectionsRenderer = new google.maps.DirectionsRenderer({
            map: getMapInstance(),
            directions: result,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: '#ff6b00',
                strokeWeight: 4,
                strokeOpacity: 0.8
            }
        });
        
        console.log('[Google Maps] Walking route calculated:', result.routes?.[0]?.legs?.[0]?.duration?.text);
        return result;
    } catch (err) {
        console.error('[Google Maps] Directions request failed:', err);
        return null;
    }
}

/**
 * drawCustomRoute
 * Draws a raw vector line geometry on the native Google Map ignoring road boundaries.
 *
 * @param {Array<{lat: number, lng: number}>} pathCoords
 * @param {string} strokeColor
 */
export function drawCustomRoute(pathCoords, strokeColor = '#ff6b00') {
    if (!window.google?.maps) return;
    
    currentVectorPolyline = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: strokeColor,
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map: getMapInstance()
    });
}

/**
 * getParkingDirections
 * Uses DRIVING mode with live traffic for parking egress routing.
 *
 * @param {{ lat: number, lng: number }} userLocation
 * @param {string} parkingLotStr  — human-readable lot name used as destination query
 * @returns {Promise<google.maps.DirectionsResult|null>}
 */
export async function getParkingDirections(userLocation, parkingLotStr) {
    if (!window.google?.maps) {
        console.warn('[Google Maps] Maps not loaded — cannot calculate parking route.');
        return null;
    }
    const svc = new google.maps.DirectionsService();
    try {
        const result = await svc.route({
            origin: userLocation,
            destination: parkingLotStr,
            travelMode: google.maps.TravelMode.DRIVING,
            drivingOptions: {
                departureTime: new Date(),
                trafficModel: google.maps.TrafficModel.BEST_GUESS,
            },
        });
        console.log('[Google Maps] Parking directions resolved:', result.routes?.[0]?.legs?.[0]?.duration_in_traffic?.text);
        return result;
    } catch (err) {
        console.error('[Google Maps] Parking directions failed:', err);
        return null;
    }
}

/**
 * showCrowdOverlay
 * Renders a HeatmapLayer over the map using the visualization library.
 *
 * @param {Array<google.maps.LatLng | { location: google.maps.LatLng, weight: number }>} heatmapDataPoints
 * @returns {google.maps.visualization.HeatmapLayer|null}
 */
export function showCrowdOverlay(heatmapDataPoints) {
    const map = getMapInstance();
    if (!map || !window.google?.maps?.visualization?.HeatmapLayer) {
        console.warn('[Google Maps] HeatmapLayer unavailable — ensure "visualization" library is loaded.');
        return null;
    }
    const layer = new google.maps.visualization.HeatmapLayer({
        data: heatmapDataPoints,
        map,
        radius: 75,
        opacity: 0.95,
        gradient: [
            'rgba(0, 255, 120, 0)',   // transparent (low density)
            'rgba(0, 255, 120, 1)',   // green
            'rgba(255, 219, 0,  1)',  // yellow
            'rgba(255, 107, 0,  1)',  // orange (primary-container)
            'rgba(220,  38, 38, 1)',  // red (critical)
        ],
    });
    currentHeatmapLayer = layer;
    console.log('[Google Maps] Crowd heatmap overlay rendered with', heatmapDataPoints?.length ?? 0, 'points.');
    return layer;
}