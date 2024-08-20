const layerStateChange = new CustomEvent('layerStateChange');

const Layer = class {
  constructor(serviceType, serviceOptions, name, dataString) {
    this.serviceType = serviceType; // WMS XYZ WMTS GEOJSON GPX
    this.serviceOptions = serviceOptions;
    this.name = name;
    this.active = false;
    this.dataString = dataString;
    if (this.serviceOptions && this.serviceOptions.url) {
      this.safeName = hashExternalLayer(this.serviceOptions.url + this.name);
    } else {
      // this is for geojson and gpx layers, we do give an error toast if the name
      // of the file which the user is trying to display is already in use
      this.safeName = hashExternalLayer(this.name);
    }

    if (serviceType === 'WMS') {
      this.source = new ol.source.TileWMS(serviceOptions);
      this.layer = new ol.layer.Tile({ source: this.source });
    } else if (serviceType === 'XYZ') {
      this.source = new ol.source.XYZ(serviceOptions);
      this.layer = new ol.layer.Tile({ source: this.source });
    } else if (serviceType === 'WMTS') {
      fetch(serviceOptions.url)
        .then(response => response.text())
        .then(text => {
          const wmtsParser = new ol.format.WMTSCapabilities();
          const wmtsData = wmtsParser.read(text);
          const wmtsOptions = ol.source.WMTS.optionsFromCapabilities(wmtsData, serviceOptions);
          this.source = new ol.source.WMTS(wmtsOptions);
          this.layer = new ol.layer.Tile({ source: this.source });
        });
    } else if (serviceType === 'GEOJSON') {
      this.source = new ol.source.Vector({ features: new ol.format.GeoJSON({ featureProjection: 'EPSG:3857' }).readFeatures(JSON.parse(this.dataString)) });
      this.layer = new ol.layer.Vector({ source: this.source });
    } else if (serviceType === 'GPX') {
      this.source = new ol.source.Vector({ features: new ol.format.GPX().readFeatures(this.dataString, { featureProjection: 'EPSG:3857' }) });
      this.layer = new ol.layer.Vector({ source: this.source });
    }

    // beacuse WMTS is set after the fetch
    if (!this.layer) {
      this.layer = new ol.layer.Tile({ source: this.source });
    }
  }

  setOpacity(opacity) {
    this.layer.setOpacity(opacity);
    document.dispatchEvent(layerStateChange);
  }

  removeFromMap(map) {
    if (!this.active) return;
    map.removeLayer(this.layer);
    this.active = false;
    document.dispatchEvent(layerStateChange);
    // #TODO reset opacity
  }

  addToMap(map) {
    if (this.active) return;
    map.addLayer(this.layer);
    this.active = true;
    document.dispatchEvent(layerStateChange);
  }

  toggle(map) {
    if (this.active) {
      this.removeFromMap(map);
      return;
    }
    this.addToMap(map);
  }

  steralizeState() {
    return {
      serviceType: this.serviceType,
      serviceOptions: this.serviceOptions,
      active: this.active,
      name: this.name,
      opacity: this.layer.getOpacity(),
      dataString: this.dataString,
    };
  }
}

let builtInBaseLayers = [];

builtInBaseLayers.push(new Layer(
  'XYZ',
  {
    attributions: '&#169; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>s bidragsgivare.',
    attributionsCollapsible: false,
    crossOrigin: 'anonymous',
    interpolate: true,
    maxZoom: 19,
    opaque: true,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
  'OpenStreetMap',
));

builtInBaseLayers.push(new Layer(
  'WMS',
  {
    url: 'https://api.lantmateriet.se/historiska-ortofoton/wms/v1/token/19075f4e-1929-323d-a7d1-5c1753904db2/?',
    crossOrigin: '',
    params: {'LAYERS': 'OI.Histortho_60'},
    serverType: 'geoserver',
    projection: 'EPSG:3857',
  },
  'Ortofoto 1949-1970',
));

builtInBaseLayers.push(new Layer(
  'WMS',
  {
    url: 'https://api.lantmateriet.se/historiska-ortofoton/wms/v1/token/19075f4e-1929-323d-a7d1-5c1753904db2/?',
    crossOrigin: '',
    params: {'LAYERS': 'OI.Histortho_75'},
    serverType: 'geoserver',
    projection: 'EPSG:3857',
  },
  'Ortofoto 1970/80-tal',
));

builtInBaseLayers.push(new Layer(
  'WMTS',
  {
    url: 'https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/token/9b342b7d9f12d4ddb92277be9869d860/?SERVICE=WMTS&request=GetCapabilities',
    layer: 'topowebb',
    projection: 'EPSG:3857',
  },
  'LM Topografiska',
));

function findLayerByName(name) {
  return builtInBaseLayers.find(layer => layer.name === name);
}

function removeLayerByName(name) {
  const index = builtInBaseLayers.findIndex(layer => layer.name === name);
  if (index === -1) return;
  builtInBaseLayers.splice(index, 1);
}

function hashExternalLayer(layerString) {
  const safe = unsafeString => unsafeString.replace(/:|\/|\/|\.|\?|\=|\&|%|<|>|\s|\(|\)/g, '');
  return safe(layerString);
}
let layerIndexLayers = [];
function findExternalLayer(hash) {
  return layerIndexLayers.find(layer => hashExternalLayer(layer.serviceOptions.url + layer.serviceOptions.params.LAYERS) === hash);
}

function searchLayerIndex(queryString) {
  let layerSearchResultContainer = document.getElementById('layerSearchResultContainer');
  const results = layerIndexLayers.filter(layer => layer.display_name.toLowerCase().includes(queryString.toLowerCase())).slice(0, 5);

  layerSearchResultContainer.innerHTML = '';
  results.forEach(result => {
    const li = document.createElement('li');
    const layerHash = hashExternalLayer(result.serviceOptions.url + result.serviceOptions.params.LAYERS);

    li.classList.add('list-group-item', 'bg-light');
    li.innerHTML = `<div>
                      <label class="form-check-label" for="switch-layer-${layerHash}">${result.display_name}</label>
                      <div class="form-check form-switch float-end">
                        <input class="form-check-input" type="checkbox" role="switch" id="switch-layer-${layerHash}">
                      </div>
                      <small><i class="text-body-secondary d-block">${result.publisher}</i></small>
                    </div>`;
    layerSearchResultContainer.appendChild(li);
  });
}

const workingLifeMuseumSource = new ol.source.Vector({
  format: new ol.format.GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }),
  loader: function(extent, resolution, projection, success, failure) {
    const southWest = ol.proj.transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326');
    const northEast = ol.proj.transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326');

    const query = `SELECT ?item ?itemLabel ?coord ?arbetsamID WHERE {
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord.
        bd:serviceParam wikibase:cornerWest "Point(${southWest[0]} ${southWest[1]})"^^geo:wktLiteral;
          wikibase:cornerEast "Point(${northEast[0]} ${northEast[1]})"^^geo:wktLiteral.
      }
      
      ?item wdt:P3426 ?arbetsamID
      SERVICE wikibase:label { bd:serviceParam wikibase:language "sv". }
    }`;
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json';
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const items = data.results.bindings.map(result => {
          const coord = result.coord.value.replace('Point(', '').replace(')', '').split(' ');
          const feature = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(coord[0]), parseFloat(coord[1])],
            },
            properties: {
              name: result.itemLabel.value,
              identifier: result.arbetsamID.value,
              item: result.item.value,
              type: 'museum',
            }
          };
          return feature;
        });
        const geojson = {
          type: 'FeatureCollection',
          features: items,
        };
        const features = workingLifeMuseumSource.getFormat().readFeatures(geojson);
        workingLifeMuseumSource.addFeatures(features);
        success();
      })
      .catch(err => {
        failure();
      });
  },
  strategy: ol.loadingstrategy.bbox
});

const workingLifeMuseumLayer = new ol.layer.Vector({
  source: workingLifeMuseumSource,
  minZoom: 12,
  style: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({
        color: '#943535',
      }),
      stroke: new ol.style.Stroke({
        color: '#fff',
        width: 1,
      }),
    }),
  }),
});

const protectedBuildingsSource = new ol.source.Vector({
  format: new ol.format.GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }),
  loader: function(extent, resolution, projection, success, failure) {
    const southWest = ol.proj.transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326');
    const northEast = ol.proj.transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326');

    // query wikidata sparql service
    const query = `SELECT ?item ?itemLabel ?coord ?sochID WHERE {
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord.
        bd:serviceParam wikibase:cornerWest "Point(${southWest[0]} ${southWest[1]})"^^geo:wktLiteral;
          wikibase:cornerEast "Point(${northEast[0]} ${northEast[1]})"^^geo:wktLiteral.
      }

      ?item wdt:P1260 ?sochID .
      ?item wdt:P1435 wd:Q24284072 .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "sv". }
    }`;
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json';
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const items = data.results.bindings.map(result => {
          const coord = result.coord.value.replace('Point(', '').replace(')', '').split(' ');
          const feature = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(coord[0]), parseFloat(coord[1])],
            },
            properties: {
              name: result.itemLabel.value,
              identifier: result.sochID.value,
              item: result.item.value,
              type: 'building',
            }
          };
          return feature;
        });
        const geojson = {
          type: 'FeatureCollection',
          features: items,
        };
        const features = protectedBuildingsSource.getFormat().readFeatures(geojson);
        features.forEach(feature => {
          feature.setId(feature.get('item'));
          if(!protectedBuildingsSource.getFeatureById(features[0].getId())) {
            protectedBuildingsSource.addFeatures(features);
          }
        });
        success();
      })
      .catch(err => {
        failure();
      });
  },
  strategy: ol.loadingstrategy.bbox
});

const protectedBuildingsLayer = new ol.layer.Vector({
  source: protectedBuildingsSource,
  minZoom: 12,
  style: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({
        color: '#c94a17',
      }),
      stroke: new ol.style.Stroke({
        color: '#fff',
        width: 1,
      }),
    }),
  }),
});

const kmrGeometrySource = new ol.source.TileWMS({
  url: 'https://karta.raa.se/geo/arkreg_v1.0/wms?',
  params: {'LAYERS': 'publicerade_lamningar_geometrier', 'TILED': true},
  serverType: 'geoserver',
});

const kmrGeometryLayer = new ol.layer.Tile({
  source: kmrGeometrySource,
});

const kmrPointSource = new ol.source.TileWMS({
  url: 'https://karta.raa.se/geo/arkreg_v1.0/wms?',
  params: {'LAYERS': 'publicerade_lamningar_centrumpunkt', 'TILED': true},
  serverType: 'geoserver',
});

const kmrPointLayer = new ol.layer.Tile({
  source: kmrPointSource,
});

const styles = {
  'Point': new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({
        color: 'rgba(190, 37, 185, 0.5)',
      }),
      stroke: new ol.style.Stroke({
        color: '#fff',
        width: 2,
      }),
    }),
  }),
  'LineString': new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: 'rgba(190, 37, 185, 0.5)',
      width: 5,
    }),
  }),
  'Polygon': new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: '#fff',
      width: 2,
    }),
    fill: new ol.style.Fill({
      color: 'rgba(190, 37, 185, 0.5)',
    }),
  }),
};


const geolocationStyles = {
  'Point': new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({
        color: '#3399CC',
      }),
      stroke: new ol.style.Stroke({
        color: '#fff',
        width: 2,
      }),
    }),
  }),
  'Polygon': new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: '#fff',
      width: 2,
    }),
    fill: new ol.style.Fill({
      color: 'RGBA(51, 153, 204, 0.4)',
    }),
  }),
}

const geolocationSource = new ol.source.Vector();
const geolocationLayer = new ol.layer.Vector({
  source: geolocationSource,
  style: (f => geolocationStyles[f.getGeometry().getType()]),
});

const measureSource = new ol.source.Vector();

const measureLayer = new ol.layer.Vector({
  source: measureSource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({
      color: 'rgba(255, 255, 255, 0.2)',
    }),
    stroke: new ol.style.Stroke({
      color: '#ffcc33',
      width: 2,
    }),
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({
        color: '#ffcc33',
      }),
    }),
  }),
});

let zoom = 5.4;
let center = ol.proj.fromLonLat([13.8, 62.9]);

if (window.location.hash !== '') {
  // try to restore center, zoom-level and rotation from the URL
  const hash = window.location.hash.replace('#map=', '');
  const parts = hash.split('/');
  if (parts.length === 3) {
    zoom = parseFloat(parts[0]);
    center = [parseFloat(parts[1]), parseFloat(parts[2])];
  }
}

const view = new ol.View({
  projection: 'EPSG:3857',
  center: center,
  zoom: zoom,
}); 

const dataLayers = {
  'dataLayerKMRPoints': kmrPointLayer,
  'dataLayerKMRGeo': kmrGeometryLayer,
  'dataLayerWorkingLifeMuseum': workingLifeMuseumLayer,
  'dataLayerProtectedBuildings': protectedBuildingsLayer,
}

function toggleDataLayer(e) {
  const { checked } = e.target;

  try {
    checked ? map.addLayer(dataLayers[e.target.id]) : map.removeLayer(dataLayers[e.target.id]);
  } catch (e) {
    if (!e instanceof ol.AssertionError) { // if layer is already removed or added
      throw e;
    }
  }
}

const map = new ol.Map({
  controls: ol.control.defaults.defaults().extend([
    new ol.control.ScaleLine({ bar: true, steps: 4, text: true, minWidth: 140 }),
  ]),
  layers: [
    kmrGeometryLayer,
    kmrPointLayer,
    workingLifeMuseumLayer,
    protectedBuildingsLayer,
    geolocationLayer,
    measureLayer,
  ],
  target: 'map',
  view: view,
});
findLayerByName('OpenStreetMap').addToMap(map);


geolocationLayer.setZIndex(50);
kmrGeometryLayer.setZIndex(51);
kmrPointLayer.setZIndex(52);
workingLifeMuseumLayer.setZIndex(53);
protectedBuildingsLayer.setZIndex(54);
measureLayer.setZIndex(55);

const locate = document.createElement('div');
locate.className = 'ol-control ol-unselectable locate';
const locateButtonDefaultHTML = '<button type="button" title="Visa min plats"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-geo-alt-fill" viewBox="0 0 16 16"><path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg></button>';
const locateButtonLoadingHTML = '<button type="button" title="Visa min plats"><div class="spinner-border text-success" style="height: 70%; width: 70%; border-width: .2em;" role="status"><span class="visually-hidden">Laddar...</span></div></button>';

locate.innerHTML = locateButtonDefaultHTML;

function zoomToGeoLocation() {
  map.getView().fit(geolocationSource.getExtent(), {
    maxZoom: 18,
    duration: 500,
  });
}

let positionTrackingActive = false;
function enableGeolocation(callback) {
  if (positionTrackingActive) {
    callback();
    return;
  }
  locate.innerHTML = locateButtonLoadingHTML;

  navigator.geolocation.watchPosition(
    function (pos) {
      const coords = [pos.coords.longitude, pos.coords.latitude];
      const accuracy = ol.geom.Polygon.circular(coords, pos.coords.accuracy);
      geolocationSource.clear(true);
      geolocationSource.addFeatures([
        new ol.Feature(
          accuracy.transform('EPSG:4326', map.getView().getProjection()),
        ),
        new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat(coords))),
      ]);
      if (!positionTrackingActive) {
        callback();
        positionTrackingActive = true;
        locate.innerHTML = locateButtonDefaultHTML;
      }
    },
    function (error) {
      alert(`ERROR: ${error.message}`);
      locate.innerHTML = locateButtonDefaultHTML;
    },
    {
      enableHighAccuracy: true,
    }
  );
}

locate.addEventListener('click', () => {
  enableGeolocation(zoomToGeoLocation);
});

map.addControl(
  new ol.control.Control({
    element: locate,
  })
);

const measure = document.createElement('div');
measure.className = 'ol-control ol-unselectable measure';
const mesureButtonHTML = '<button type="button" title="Mät i kartan"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-rulers" viewBox="0 0 16 16"><path d="M1 0a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5v-1H2v-1h4v-1H4v-1h2v-1H2v-1h4V9H4V8h2V7H2V6h4V2h1v4h1V4h1v2h1V2h1v4h1V4h1v2h1V2h1v4h1V1a1 1 0 0 0-1-1H1z"/></svg></button>';
const mesureButtonActiveHTML = '<button type="button" title="Stäng av mät i kartan"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#ce8157" class="bi bi-rulers" viewBox="0 0 16 16"><path d="M1 0a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5v-1H2v-1h4v-1H4v-1h2v-1H2v-1h4V9H4V8h2V7H2V6h4V2h1v4h1V4h1v2h1V2h1v4h1V4h1v2h1V2h1v4h1V1a1 1 0 0 0-1-1H1z"/></svg></button>';
measure.innerHTML = mesureButtonHTML;

let measureActive = false;
let measureSketch;
let measureHelpTooltip;
let measureHelpTooltipElement;
let measureTooltip;
let measureTooltipElement;
let measureDraw;

const formatLength = function (line) {
  const length = ol.sphere.getLength(line);
  let output;
  if (length > 100) {
    output = Math.round((length / 1000) * 100) / 100 + ' ' + 'km';
  } else {
    output = Math.round(length * 100) / 100 + ' ' + 'm';
  }
  return output;
};

function addMeasureInteraction() {
  measureDraw = new ol.interaction.Draw({
    source: measureSource,
    type: 'LineString',
    style: new ol.style.Style({
      fill: new ol.style.Fill({
        color: 'rgba(255, 255, 255, 0.2)',
      }),
      stroke: new ol.style.Stroke({
        color: 'rgba(0, 0, 0, 0.5)',
        lineDash: [10, 10],
        width: 2,
      }),
      image: new ol.style.Circle({
        radius: 5,
        stroke: new ol.style.Stroke({
          color: 'rgba(0, 0, 0, 0.7)',
        }),
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 0.2)',
        }),
      }),
    }),
  });
  map.addInteraction(measureDraw);

  createMeasureTooltip();
  createHelpTooltip();

  let listener;
  measureDraw.on('drawstart', function (evt) {
    // set sketch
    measureSketch = evt.feature;
    let tooltipCoord = evt.coordinate;

    listener = measureSketch.getGeometry().on('change', function (evt) {
      const geom = evt.target;
      const output = formatLength(geom);
      tooltipCoord = geom.getLastCoordinate();
      measureTooltipElement.innerHTML = output;
      measureTooltip.setPosition(tooltipCoord);
    });
  });

  measureDraw.on('drawend', function () {
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
    measureTooltip.setOffset([0, -7]);
    // unset sketch
    sketch = null;
    // unset tooltip so that a new one can be created
    measureTooltipElement = null;
    createMeasureTooltip();
    ol.Observable.unByKey(listener);
  });
}

/**
 * Creates a new help tooltip
 */
function createHelpTooltip() {
  if (measureHelpTooltipElement) {
    measureHelpTooltipElement.parentNode.removeChild(measureHelpTooltipElement);
  }
  measureHelpTooltipElement = document.createElement('div');
  measureHelpTooltipElement.className = 'ol-tooltip hidden';
  measureHelpTooltip = new ol.Overlay({
    element: measureHelpTooltipElement,
    offset: [15, 0],
    positioning: 'center-left',
  });
  map.addOverlay(measureHelpTooltip);
}

/**
 * Creates a new measure tooltip
 */
function createMeasureTooltip() {
  if (measureTooltipElement) {
    measureTooltipElement.parentNode.removeChild(measureTooltipElement);
  }
  measureTooltipElement = document.createElement('div');
  measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
  measureTooltip = new ol.Overlay({
    element: measureTooltipElement,
    offset: [0, -15],
    positioning: 'bottom-center',
    stopEvent: false,
    insertFirst: false,
  });
  map.addOverlay(measureTooltip);
}

measure.addEventListener('click', function () {
  if (!measureActive) {
    measureActive = true;
    measure.innerHTML = mesureButtonActiveHTML;
    addMeasureInteraction();
  } else {
    map.removeInteraction(measureDraw);
    measureSource.clear();
    measure.innerHTML = mesureButtonHTML;
    // this removes all the overlays, not just the measure overlays
    map.getOverlays().clear()
    measureActive = false;
  }
});
map.addControl(
  new ol.control.Control({
    element: measure,
  })
);

// track map state

let shouldUpdate = true;
const updatePermalink = function () {
  if (!shouldUpdate) {
    // do not update the URL when the view was changed in the 'popstate' handler
    shouldUpdate = true;
    return;
  }

  const center = view.getCenter();
  const hash =
    '#map=' +
    view.getZoom().toFixed(2) +
    '/' +
    center[0].toFixed(2) +
    '/' +
    center[1].toFixed(2)
  const state = {
    zoom: view.getZoom(),
    center: view.getCenter(),
  };
  window.history.pushState(state, 'map', hash);
  if (document.querySelector('#register-btn')) {
    document.querySelector('#register-btn').href = document.querySelector('#register-btn').href.split('#')[0] + hash;
  }
};

map.on('moveend', updatePermalink);

// restore the view state when navigating through the history, see
// https://developer.mozilla.org/en-US/docs/Web/API/WindowEventHandlers/onpopstate
window.addEventListener('popstate', function (event) {
  if (event.state === null) {
    return;
  }
  map.getView().setCenter(event.state.center);
  map.getView().setZoom(event.state.zoom);
  shouldUpdate = false;
});

// global click handler

map.on('singleclick', function (evt) {
  document.querySelector('#popup-tab-buttons').innerHTML = '';
  document.querySelector('#popup-tab-content').innerHTML = '';
  popup.style.display = 'none';

  if (view.getZoom() <= 12) return;
  const clickedLatLon = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');

  map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
    const featureProps = feature.getProperties();
    renderPopup(
      featureProps.name,
      featureProps.identifier,
      featureProps.type,
      clickedLatLon,
    );
  });

  // look for kmr items
  const viewResolution = (view.getResolution());
  const url = kmrPointSource.getFeatureInfoUrl(
    evt.coordinate,
    viewResolution,
    'EPSG:3857',
    {
      'INFO_FORMAT': 'application/json',
      'FEATURE_COUNT': 10,
      'LAYERS': 'arkreg_v1.0:publicerade_lamningar_geometrier,arkreg_v1.0:publicerade_lamningar_centrumpunkt',
      'QUERY_LAYERS': 'arkreg_v1.0:publicerade_lamningar_geometrier,arkreg_v1.0:publicerade_lamningar_centrumpunkt',
    }
  );
  if (url) {
    fetch(url.replace('https://karta.raa.se/geo/arkreg_v1.0/wms', 'https://fornpunkt.se/raa/wms-proxy'))
      .then((response) => response.json())
      .then((features) => {
        // foreach unique feature
        const uniqueFeatures = [];
        features.features.forEach((feature) => {
          const KMRfeature = feature.properties;
          if (uniqueFeatures.includes(KMRfeature.lamning_id)) return;
          uniqueFeatures.push(KMRfeature.lamning_id);
          renderPopup(
            KMRfeature.lamningstyp_namn + ' (' + KMRfeature.lamningsnummer + ')',
            KMRfeature.lamning_id,
            'site',
            clickedLatLon,
          );
      });
    });
  }
});

function popupIsOpen() {
  return (document.querySelector('#popup').style.display === 'block') ? true : false;
}

function renderPopupTab(title, id, type, coordinate, active=false) {
  let campaign, externalLinkPrefixes;
  switch (type) {
    case 'site':
      campaign = 'wlm-se-fornmin';
      externalLinkPrefixes = [['https://kulturarvsdata.se/raa/lamning/', 'Fornsök'], ['https://fornpunkt.se/raa/lamning/', 'FornPunkt']];
      break;
    case 'building':
      campaign = 'wlm-se-bbr';
      externalLinkPrefixes = [['https://kulturarvsdata.se/', 'Bebyggelseregistret']];
      break;
    case 'museum':
      campaign = 'wlm-se-arbetsl';
      externalLinkPrefixes = [['https://arbetsam.com/sok-arbetslivsmuseum/?museum_id=', 'ArbetSam']];
  }

  const tabContent = document.createElement('div');
  tabContent.className = 'tab-pane fade ' + (active ? 'show active' : '');
  tabContent.id = 'tab-content-' + id;
  tabContent.setAttribute('role', 'tabpanel');
  tabContent.setAttribute('aria-labelledby', 'tab-button-' + id);
  tabContent.innerHTML = `<p>Visa i: ${externalLinkPrefixes.map(external => `<a href="${external[0]}${id}" target="_blank">${external[1]}</a>, `)} <a href="https://www.google.com/maps/search/?api=1&query=${coordinate[1]}%2C${coordinate[0]}" target="_blank">Google Maps</a></p>
  <div class="d-grid gap-2">
    <a href="https://commons.wikimedia.org/w/index.php?title=Special:UploadWizard&campaign=${campaign}&id=${id}" target="_blank" class="btn btn-primary">Ladda upp din bild!</a>
  </div>`;

  const contentContainer = document.querySelector('#popup-tab-content');
  contentContainer.appendChild(tabContent);

  const tabButton = document.createElement('li');
  tabButton.setAttribute('role', 'presentation');
  tabButton.className = 'nav-item';
  tabButton.innerHTML = `<button class="nav-link${active ? ' active' : ''}" id="tab-button-${id}" data-bs-toggle="pill" data-bs-target="#tab-content-${id}" type="button" role="tab" aria-controls="tab-content-${id}" ${active ? 'aria-selected="true"' : ''}>${title}</button>`;
  const tabButtonContainer = document.querySelector('#popup-tab-buttons');
  tabButtonContainer.appendChild(tabButton);
}

function renderPopup(header, id, type, coordinate) {
  if (!header) return; // to deal with interactive editing layers

  var popup = document.querySelector('#popup');
  if (popupIsOpen()) {
    renderPopupTab(header, id, type, coordinate, false);
  } else {
    document.querySelector('#popup-tab-buttons').innerHTML = '';
    document.querySelector('#popup-tab-content').innerHTML = '';
    renderPopupTab(header, id, type, coordinate, true);
  }

  popup.style.display = 'block';
}

document.querySelector('#popup button').addEventListener('click', function() {
  document.querySelector('#popup').style.display = 'none';
});

// layer sidebar
const layerSelectionBtn = document.createElement('div');
layerSelectionBtn.className = 'ol-control ol-unselectable layer-selection-btn';
layerSelectionBtn.innerHTML = '<button type="button" title="Välj lager" data-bs-toggle="offcanvas" data-bs-target="#mapContentsSidebar" aria-controls="offcanvasRight"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-layers-fill" viewBox="0 0 16 16"><path d="M7.765 1.559a.5.5 0 0 1 .47 0l7.5 4a.5.5 0 0 1 0 .882l-7.5 4a.5.5 0 0 1-.47 0l-7.5-4a.5.5 0 0 1 0-.882l7.5-4z"/><path d="m2.125 8.567-1.86.992a.5.5 0 0 0 0 .882l7.5 4a.5.5 0 0 0 .47 0l7.5-4a.5.5 0 0 0 0-.882l-1.86-.992-5.17 2.756a1.5 1.5 0 0 1-1.41 0l-5.17-2.756z"/></svg></button>';

const layerSelectionSidebar = document.querySelector('#mapContentsSidebar');
layerSelectionSidebar.addEventListener('hidden.bs.offcanvas', function() {
  Array.from(document.querySelectorAll('.ol-control')).forEach(function(control) {
    control.style.right = '.5em';
  });
});

layerSelectionSidebar.addEventListener('shown.bs.offcanvas', function() {
  if (window.innerWidth <= 2100) {
    var mapMargin = (window.innerWidth - document.querySelector('#map').clientWidth) / 2;
    var controlDistance = 'calc(.5em + ' + (400 - mapMargin) + 'px)';
    Array.from(document.querySelectorAll('.ol-control')).forEach(function(control) {
      control.style.right = controlDistance;
    });
  }
});


map.addControl(
  new ol.control.Control({
    element: layerSelectionBtn,
  })
);

const supportedLayerSelector = document.querySelector('#supportedLayerSelector');

function refreshBaseLayerSelector() {
  supportedLayerSelector.innerHTML = '';
  builtInBaseLayers.forEach(layer => {
    const li = document.createElement('li');
    li.classList.add('list-group-item', 'bg-light');
  
    const active = layer.active ? 'checked' : '';
  
    const innerHTML = `<div>
      <label class="form-check-label" for="baseLayerSwitch-${ layer.safeName }">${ layer.name }</label>
      <div class="form-check form-switch float-end">
        <input data-layer-name="${ layer.name }" class="form-check-input" ${ active } type="checkbox" role="switch" id="baseLayerSwitch-${ layer.safeName }">
      </div>
      <input data-layer-name="${ layer.name }" aria-label="Ändra transparens för ${ layer.name }." type="range" class="form-range" min="0" max="1" step="0.01" value="${ layer.layer.getOpacity() }">
    </div>`;
    li.innerHTML = innerHTML;
    supportedLayerSelector.appendChild(li);
  });
}
refreshBaseLayerSelector();

supportedLayerSelector.addEventListener('change', e => {
  const layerName = e.target.dataset.layerName;
  const layer = findLayerByName(layerName);

  if (e.target.type === 'checkbox') layer.toggle(map);
  if (e.target.type === 'range') layer.setOpacity(parseFloat(e.target.value));
});

document.querySelector('#wms-use').addEventListener('click', () => {
  const wmsURLInput = document.querySelector('#wms-url');
  const wmsLayerInput = document.querySelector('#wms-layer-name');
  const wmsVersionInput = document.querySelector('#wms-version');
  const layer = new Layer(
    'WMS',
    {
          url: wmsURLInput.value.split('?')[0],
          params: {'LAYERS': wmsLayerInput.value, 'VERSION': wmsVersionInput.value},
          projection: 'EPSG:3857',
          serverType: 'geoserver',
    },
    wmsLayerInput.value,
  );
  builtInBaseLayers.unshift(layer);
  layer.addToMap(map);

  wmsURLInput.value = '';
  wmsLayerInput.value = '';

  refreshBaseLayerSelector();
  showToast('Lager tillagt under "Aktiva lager".', 'secondary');
});

document.querySelector('#xyz-use').addEventListener('click', e => {
  const xyzURLInput = document.querySelector('#xyz-url'); // this split appears to be needed but breaks some links
  const xyzNameInput = document.querySelector('#xyz-name');
  const layer = new Layer(
    'XYZ',
    {
      url: xyzURLInput.value.split('?')[0],
    },
    xyzNameInput.value,
  );

  builtInBaseLayers.unshift(layer);
  layer.addToMap(map);

  xyzURLInput.value = '';
  xyzNameInput.value = '';

  refreshBaseLayerSelector();
  showToast('Lager tillagt under "Aktiva lager".', 'secondary');
});

var fileDropZone = document.querySelector('.drop-zone');
var fileLayerInput = document.querySelector('#file-layer-input');

function addFileAsLayer(file) {
  let type;
  if (file.name.endsWith('.geojson')) {
    type = 'GEOJSON';
  } else if (file.name.endsWith('.gpx')) {
    type = 'GPX';
  }

  if (findLayerByName(file.name)) {
    showToast('Ett lager med det namnet finns redan.', 'secondary');
    return;
  }

  var reader = new FileReader();
  reader.readAsText(file);
  reader.onload = function(e) {
    try {
      const layer = new Layer(
        type,
        null,
        file.name,
        reader.result,
      );
      builtInBaseLayers.unshift(layer);
      layer.addToMap(map);
      map.getView().fit(layer.source.getExtent());
      showToast('Lager tillagt under "Aktiva lager".', 'secondary');
    } catch (e) {
      showToast('Innehållet gick inte att visa.', 'secondary');
      removeLayerByName(file.name);
    } finally {
      refreshBaseLayerSelector();
    }
  };
}

function dragActive(e) {
  e.preventDefault();
  fileDropZone.classList.add('is-dragover');
}

function dragInactive(e) {
  e.preventDefault();
  fileDropZone.classList.remove('is-dragover');
}

fileDropZone.addEventListener('dragover', e => dragActive(e));
fileDropZone.addEventListener('dragenter', e => dragActive(e));
fileDropZone.addEventListener('dragleave', e => dragInactive(e));
fileDropZone.addEventListener('dragend', e => dragInactive(e));

fileLayerInput.addEventListener('change', e => {
  Array.from(e.target.files).forEach(file => {
    addFileAsLayer(file);
  });
});

fileDropZone.addEventListener('drop', e => {
  Array.from(e.originalEvent.dataTransfer.files).forEach(file => {
    addFileAsLayer(file);
  });
});
