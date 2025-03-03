import { getWorldXYZ } from '@dataforsyningen/saul'
import { queryItems } from '../modules/api.js'
import { setParams } from '../modules/url-state.js'

/**
 * Enables a user to click an image an have it centered in that location
 */
export class CenterTool {

  constructor(viewport) {

    // Set up event listener
    viewport.map.on('singleclick', (event) => {
      if (viewport.mode === 'center') {
        viewport.displaySpinner()
        getWorldXYZ({
          image: viewport.item,
          terrain: viewport.terrain,
          xy: event.coordinate
        }, 0.03).then((world_xyz) => {
          
          this.update(event, viewport, world_xyz)
          
        })
      }
    })
  }


  // Methods

  checkBounds(img_shape, coordinate) {
    const bound = 500
    if (coordinate[0] < bound || coordinate[0] > (img_shape[1] - bound)) {
      return false
    } else if (coordinate[1] < bound || coordinate[1] > (img_shape[0] - bound)) {
      return false
    } else {
      return true
    }
  }

  update(event, viewport, world_xyz) {

    viewport.coord_world = world_xyz

    // Checks if click was made near image bounds and initiate loading a new image
    if ( !this.checkBounds(viewport.item.properties['proj:shape'], event.coordinate) ) {
      queryItems(viewport.coord_world, viewport.item.properties.direction, viewport.item.collection, 1)
      .then(response => {
        if (response.features[0].id !== viewport.item.id) {
          setParams({ center: world_xyz, item: response.features[0].id })
        }   
      })
    } else {
      setParams({ center: world_xyz })
    }
  }
  
}
