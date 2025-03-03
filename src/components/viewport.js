import Projection from 'ol/proj/Projection.js'
import GeoTIFF from 'ol/source/GeoTIFF.js'
import WebGLTile from 'ol/layer/WebGLTile.js'
import OlMap from 'ol/Map.js'
import View from 'ol/View.js'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Icon, Style } from 'ol/style'
import { defaults as defaultControls } from 'ol/control'
import { defaults as defaultInteractions } from 'ol/interaction'
import { getZ, world2image } from '@dataforsyningen/saul'
import { queryItem } from '../modules/api.js'
import { toDanish } from '../modules/i18n.js'
import { configuration } from '../modules/configuration.js'
import { getTerrainData } from '../modules/api.js'
import { renderParcels } from '../custom-plugins/plugin-parcel.js'


/**
 *  Web component that displays an image using the OpenLayers library
 */
export class SkraaFotoViewport extends HTMLElement {

  // properties
  item
  coord_image
  coord_world
  zoom = 4
  terrain
  api_stac_token = configuration.API_STAC_TOKEN
  map
  layer_image
  layer_icon
  source_image
  view
  compass_element

  // HACK to avoid bug looking up meters per unit for 'pixels' (https://github.com/openlayers/openlayers/issues/13564)
  // when the view resolves view properties, the map view will be updated with the HACKish projection override
  projection = new Projection({
    code: 'custom',
    units: 'pixels',
    metersPerUnit: 1
  })

  styles = `
    .viewport-wrapper {
      position: relative;
      height: 100%;
      width: 100%;
      display: block;
    }
    .viewport-map { 
      width: 100%; 
      height: 100%;
      background: url(/img/ds-pulser.svg) no-repeat center center var(--mork-tyrkis);
      position: relative;
    }
    skraafoto-compass {
      position: absolute;
      top: 1.5rem;
      right: 1rem;
      -webkit-transform: translate3d(0,0,0); /* Fix for Safari bug */
    }
    .image-date {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      color: #fff;
      margin: 0;
      -webkit-transform: translate3d(0,0,0); /* Fix for Safari bug */
    }

    @media screen and (max-width: 35rem) {

      skraafoto-compass {
        top: 0.5rem;
        right: 0.5rem;
      }

      .image-date {
        bottom: 0.5rem;
        left: 0.5rem;
      }

    }
  `
  template = `
    <link rel="stylesheet" href="./style.css">
    <style>
      ${ this.styles }
    </style>
    <div class="viewport-map"></div>
    <skraafoto-compass direction="north"></skraafoto-compass>
    <p id="image-date" class="image-date"></p>
  `


  // getters
  static get observedAttributes() {
    return [
      'data-item',
      'data-center',
      'data-zoom'
    ]
  }


  // setters
  set setData(data) {
    this.update(data)
  }


  constructor() {
    super()
    this.createShadowDOM()
  }


  // Methods

  createShadowDOM() {
    // Create a shadow root
    this.attachShadow({mode: 'open'}) // sets and returns 'this.shadowRoot'
    // Create div element
    const wrapper = document.createElement('article')
    wrapper.className = 'viewport-wrapper'
    wrapper.innerHTML = this.template
    // attach the created elements to the shadow DOM
    this.shadowRoot.append(wrapper)

    this.compass_element = this.shadowRoot.querySelector('skraafoto-compass')
    if (configuration.ENABLE_SMALL_FONT) {
      this.shadowRoot.getElementById('image-date').style.fontSize = '0.75rem';

    }
  }

  async update({item,center,zoom}) {
    if (typeof item === 'object') {
      this.updateImage(item)
    } else if (typeof item === 'string') {
      const item_obj = await queryItem(item)
      this.updateImage(item_obj)
    }
    if (center) {
      await this.updateCenter(center)
    }
    if (zoom) {
      this.zoom = zoom
    } else {
      const current_zoom = this.map.getView().getZoom()
      if (current_zoom) {
        this.zoom = current_zoom
      }
    }
    this.updateMap()
    this.updateNonMap()
  }

  updateImage(item) {
    if (this.map && item.id !== this.item?.id) {
      this.item = item
      this.source_image = this.generateSource(this.item.assets.data.href)

      this.map.removeLayer(this.layer_image)
      this.layer_image = this.generateLayer(this.source_image)
      this.map.addLayer(this.layer_image)
    }
  }

  async updateMap() {

    if (!this.item || !this.coord_image || !this.zoom || !this.map) {
      return
    }

    this.map.removeLayer(this.layer_icon)
    this.layer_icon = this.generateIconLayer(this.coord_image, './img/icons/icon_crosshair.svg')
    this.map.addLayer(this.layer_icon)

    this.view = await this.source_image.getView()
    this.view.projection = this.projection

    // Set extra resolutions so we can zoom in further than the resolutions permit normally
    this.view.resolutions = this.addResolutions(this.view.resolutions)

    // Rotate nadir images relative to north
    this.view.rotation = this.getAdjustedNadirRotation(this.item)

    this.view.center = this.coord_image
    this.view.zoom = this.zoom
    this.map.setView(new View(this.view))
  }

  /** Calculate how much to rotate a nadir image to have it north upwards */
  getAdjustedNadirRotation(item) {
    if (item.properties.direction === 'nadir') {
      //return item.properties['pers:kappa'] / (360 / (2 * Math.PI))
      return ( item.properties['pers:kappa'] * Math.PI ) / 180
    } else {
      return 0
    }
  }

  generateSource(geotiff_href) {
    return new GeoTIFF({
      convertToRGB: true,
      transition: 0,
      sources: [{ url: geotiff_href, bands: [1,2,3] }] // Ignores band 4. See https://openlayers.org/en/latest/apidoc/module-ol_source_GeoTIFF.html#~SourceInfo
    })
  }

  generateLayer(src) {
    return new WebGLTile({source: src, preload: 4})
  }

  generateIconLayer(center, icon_image) {
    if (center) {
      let icon_feature = new Feature({
        geometry: new Point([center[0], center[1]])
      })
      const icon_style = new Style({
        image: new Icon({
          src: icon_image,
          scale: 2.5
        })
      })
      icon_feature.setStyle(icon_style)
      return new VectorLayer({
        source: new VectorSource({
          features: [icon_feature]
        })
      })
    }
  }

  /** Adds extra resolutions to enable deep zoom */
  addResolutions(resolutions) {
    let new_resolutions = Array.from(resolutions)
    const tiniest_res = new_resolutions[new_resolutions.length - 1]
    new_resolutions.push(tiniest_res / 2)
    new_resolutions.push(tiniest_res / 4)
    return new_resolutions
  }

  async updateCenter(coordinate) {
    if (!this.item) {
      return
    }
    if (coordinate[2] === undefined) {
      coordinate[2] = await getZ(coordinate[0], coordinate[1], configuration)
    }
    this.coord_world = coordinate
    this.coord_image = world2image(this.item, coordinate[0], coordinate[1], coordinate[2])
  }

  updateNonMap() {
    if (!this.item) {
      return
    }
    this.updateDirection(this.item)
    this.updateDate(this.item)
    this.updateTextContent(this.item)
    this.updatePlugins()
  }

  updateDirection(imagedata) {
    this.compass_element.setAttribute('direction', imagedata.properties.direction)
  }

  updateDate(imagedata) {
    const datetime = new Date(imagedata.properties.datetime).toLocaleDateString()
    this.shadowRoot.querySelector('.image-date').innerText = datetime
  }

  updateTextContent(imagedata) {
    const area_x = ((imagedata.bbox[0] + imagedata.bbox[2]) / 2).toFixed(0)
    const area_y = ((imagedata.bbox[1] + imagedata.bbox[3]) / 2).toFixed(0)
    this.innerText = `Billede af området omkring koordinat ${area_x} øst,${area_y} nord set fra ${toDanish(imagedata.properties.direction)}.`
  }

  updatePlugins() {
    getTerrainData(this.item).then(terrain => {
      this.terrain = terrain
    })
    if (configuration.ENABLE_PARCEL) {
      renderParcels(this)
    }
  }

  // Lifecycle callbacks

  connectedCallback() {

    this.map = new OlMap({
      target: this.shadowRoot.querySelector('.viewport-map'),
      controls: defaultControls({rotate: false, attribution: false, zoom: false}),
      interactions: defaultInteractions({dragPan: false, pinchRotate: false}),
      view: this.view
    })
  }


  attributeChangedCallback(name, old_value, new_value) {
    const data = {}
    if (name === 'data-item' && old_value !== new_value) {
      data.item = new_value
    }
    if (name === 'data-center' && old_value !== new_value) {
      data.center = JSON.parse(new_value)
    }
    if (name === 'data-zoom' && old_value !== new_value) {
      data.zoom = Number(new_value)
    }
    this.setData = data
  }
}

// This is how to initialize the custom element
// customElements.define('skraafoto-viewport', SkraaFotoViewport)
