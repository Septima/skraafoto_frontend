import { queryItems, queryItem, getCollections } from '../modules/api.js'
import { SkraaFotoAdvancedViewport } from '../components/advanced-viewport.js'
import { SkraaFotoAddressSearch } from '../components/address-search.js'
import { SkraaFotoDateSelector } from '../components/date-selector.js'
import { SkraaFotoInfoBox } from '../components/info-box.js'
import { SkraaFotoHeader } from '../components/page-header.js'
import { configuration } from '../modules/configuration.js'
import { SkraaFotoViewSwitcher} from '../components/tool-view-switcher.js'
import { CookieAlert } from '../components/cookie-alert.js'
import { getGSearchCenterPoint } from '../modules/gsearch-util.js'


// Initialize web components

customElements.define('skraafoto-advanced-viewport', SkraaFotoAdvancedViewport)
customElements.define('skraafoto-address-search', SkraaFotoAddressSearch)
customElements.define('skraafoto-date-selector', SkraaFotoDateSelector)
customElements.define('skraafoto-info-box', SkraaFotoInfoBox)
customElements.define('skraafoto-header', SkraaFotoHeader)


// Variables and state
let active_viewport = null
let state = {
  coordinate: null, // EPSG:25832 coordinate [longitude,latitude]
  item: null,
  item1: null,
  item2: null
}
let url_params = (new URL(document.location)).searchParams
let collections = []

const viewport_element_1 = document.getElementById('viewport-1')
const viewport_element_2 = document.getElementById('viewport-2')


// Methods

function updateViewports(state) {
  if (state.item1) {
    viewport_element_1.setItem = state.item1
  }
  if (state.item2) {
    viewport_element_2.setItem = state.item2
  }
  if (state.coordinate) {
    viewport_element_1.setCenter = state.coordinate
    viewport_element_2.setCenter = state.coordinate
  }    
}

function updateViews(state) {

  // If no coordinate is given, center mid-image
  if (!state.coordinate && state.item1) {
    state.coordinate = [
      (state.item1.bbox[0] + state.item1.bbox[2]) / 2,
      (state.item1.bbox[1] + state.item1.bbox[3]) / 2
    ]
  }

  updateViewports(state)

  updateUrl(state)
}

function queryItemsForDifferentCollections(state, collections, collection_idx) {
  return queryItems(state.coordinate, 'north', collections[collection_idx].id).then((response) => {
    if (response.features.length > 0) {
      state.item1 = response.features[0]
      state.item2 = response.features[0]
      return state
    } else {
      return queryItemsForDifferentCollections(state, collections, collection_idx + 1)
    }
  })
}

function parseUrlState(params, state) {
  let new_state = Object.assign({}, state)
  
  // Parse center param from URL
  const param_center = params.get('center')
  if (param_center) {
    new_state.coordinate = param_center.split(',').map(function(coord) {
      return Number(coord)
    })
  }
  
  // Parse item param from URL
  const param_item1 = params.get('item1')
  if (param_item1) {
    return queryItem(param_item1).then((item) => {
      new_state.item1 = item
      new_state.item2 = item
      return new_state
    })
  } else {
    // Go through all collections and return the newest available item
    return queryItemsForDifferentCollections(new_state, collections, 0)
  }
}

function updateUrl(state) {
  const url = new URL(window.location)
  if (state.item1) {
    url.searchParams.set('item1', state.item1.id)
  }
  if (state.item2) {
    url.searchParams.set('item2', state.item2.id)
  }
  if (state.coordinate) {
    url.searchParams.set('center', state.coordinate[0] + ',' + state.coordinate[1])
  }
  window.history.pushState({}, '', url)
}

async function shiftItem(direction, item_key) {
  
  let new_orientation = 'north'
  if (state[item_key].properties.direction === 'north') {
    if (direction === 'right') {
      new_orientation = 'west'
    } else {
      new_orientation = 'east'
    }
  } else if (state[item_key].properties.direction === 'west') {
    if (direction === 'right') {
      new_orientation = 'south'
    } else {
      new_orientation = 'north'
    }
  } else if (state[item_key].properties.direction === 'south') {
    if (direction === 'right') {
      new_orientation = 'east'
    } else {
      new_orientation = 'west'
    }
  } else if (state[item_key].properties.direction === 'east') {
    if (direction === 'right') {
      new_orientation = 'north'
    } else {
      new_orientation = 'south'
    }
  }

  queryItems(state.coordinate, new_orientation, state[item_key].collection).then((response) => {
    if (response.features.length > 0) {
      console.log(state[item_key],response.features[0])
      state[item_key] = response.features[0]
      updateViews(state)
    } else {
      console.error(`No image found facing ${ new_orientation }`)
    }
  })
}

function setupConfigurables(conf) {
  if (conf.ENABLE_VIEW_SWITCH) {
    customElements.define('skraafoto-view-switcher', SkraaFotoViewSwitcher)
  }
  if (conf.ENABLE_WEB_STATISTICS) {
    customElements.define('cookie-alert', CookieAlert)
  }
}

// Set up event listeners

// When a coordinate input is given, update viewports
document.addEventListener('coordinatechange', async function(event) {
  state.coordinate = event.detail
  updateViews(state)
})

// On a new address input, update viewports
document.addEventListener('addresschange', function(event) {
  state.coordinate = getGSearchCenterPoint(event.detail)
  queryItemsForDifferentCollections(state, collections, 0).then((response) => {
    state.item1 = response.item
    state.item2 = response.item
    updateViews(state)
  })
})

// When a differently dated image is selected, update the URL and check to see if direction picker needs an update
viewport_element_1.shadowRoot.addEventListener('imagechange', function(event) {
  state.item = event.detail
  updateUrl(state)
})

viewport_element_2.shadowRoot.addEventListener('imagechange', function(event) {
  state.item = event.detail
  updateUrl(state)
})

// Catch load errors and display to user
window.addEventListener('offline', function() {
  alert('Du er ikke længere online. Prøv igen senere.')
})
document.addEventListener('loaderror', function(event) {
  console.error('Network error: ', event.details)
  alert('Der var et problem med at hente data fra serveren')
})

// Set up shortkeys
document.addEventListener('keyup', function(event) {
  switch(event.key) {
    case '1':
      active_viewport = 1
      viewport_element_2.classList.remove('active')
      viewport_element_1.classList.add('active')
      break
    case '2':
      active_viewport = 2
      viewport_element_1.classList.remove('active')
      viewport_element_2.classList.add('active')
      break
    case 'ArrowLeft':
      if (active_viewport === 1) {
        shiftItem('left', 'item1')
      } else if (active_viewport === 2) { 
        shiftItem('left', 'item2')
      }
      break
    case 'ArrowRight':
      if (active_viewport === 1) {
        shiftItem('right', 'item1')
      } else if (active_viewport === 2) { 
        shiftItem('right', 'item2')
      }
      break
    default:
      // Nothing
  }
})


// Initialize

setupConfigurables(configuration)

getCollections().then(colls => {
  collections = colls

  parseUrlState(url_params, state).then((new_state) => {
    state = new_state
    updateViews(state)
  })
})
