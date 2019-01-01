const ROUND_LIMIT = 10
// config
let EDGE_SELECTOR


function register (cytoscape) {
  // TODO: can this happen? Drop it?
  if (!cytoscape) {
    console.warn('Can\'t register cytoscape-edge-connections; Cytoscape not available')
    return
  }
  // register extensions
  cytoscape('core', 'edgeConnections', edgeConnections)
  cytoscape('core', 'addEdge', addEdge)
  cytoscape('core', 'addEdges', addEdges)
  cytoscape('collection', 'auxNode', auxNode)
  cytoscape('collection', 'isAuxNode', isAuxNode)
  cytoscape('collection', 'edgeId', edgeId)
};

// expose to global cytoscape (i.e. window.cytoscape)
if (typeof cytoscape !== 'undefined') {
  register(cytoscape)
}

module.exports = register

function edgeConnections (config = {}) {
  // config
  EDGE_SELECTOR = config.edgeSelector || 'edge'
  // Note: eventHandlers operates on config
  eventHandlers(this)
}

/**
 * @param   edge    Cytoscape edge (POJO); source and target IDs may refer to another edge
 */
function addEdge (edge) {
  if (!_addEdge(edge, this)) {
    console.warn('Edge can\'t be added to graph as a player does not exist', edge)
  }
}

/**
 * @param   edges   array of Cytoscape edge (POJO); source and target IDs may refer to another edge
 */
function addEdges (edges) {
  let rounds = 0
  do {
    edges = edges.filter(edge => !_addEdge(edge, this))
    if (++rounds === ROUND_LIMIT) {
      throw Error(`too many add-edges rounds (limit is ${ROUND_LIMIT})`)
    }
  } while (edges.length)
  console.log(`${rounds} add-edges rounds`)
}

/**
 * @param   edge    Cytoscape edge (POJO).
 *                  Source and target IDs may refer to another edge.
 *                  Source and target IDs may be strings or numbers.
 */
function _addEdge (edge, cy) {
  if (resolve(edge, 'source', cy) && resolve(edge, 'target', cy)) {
    createAuxNode(cy, cy.add(edge))
    return true
  }
}

/**
 * Resolves an edge end. The edge is manipulated in-place.
 *
 * @param     edge    Note: for the edge's source/target IDs both ist supported, string or number
 * @param     end     the end to resolve: 'source' or 'target' (string)
 *
 * @return    true if the edge end could be resolved
 */
function resolve (edge, end, cy) {
  const id = edge.data[end]
  const ele = cy.getElementById(id.toString())
  if (ele.empty()) {
    return false
  }
  if (ele.isEdge()) {
    edge.data[end] = auxNodeId(ele)
  }
  return true
}

/**
 * Creates and adds an aux node that represents the given edge.
 */
function createAuxNode (cy, edge) {
  const p1 = edge.source().position()
  const p2 = edge.target().position()
  const auxNode = cy.add({
    // Note: the aux node ID (string) is generated by Cytoscape.
    // Aux nodes are recognized by having "edgeId" data.
    data: {
      edgeId: eleId(edge),                // set aux node->edge ref
      color: edge.data('color')           // TODO: add "auxNodeData" config
    },
    position: {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    }
  }).lock()
  edge.data('auxNodeId', auxNode.id())    // set edge->aux node ref
}

function eventHandlers (cy) {
  // Note: for edge connecting edges aux node position changes must cascade.
  // So the position event selector must capture both aux nodes and regular nodes.
  // FIXME: also the edge handler node is captured, but should not be a problem.
  cy.on('position', 'node', e => repositionAuxNodes(e.target))
  cy.on('remove', EDGE_SELECTOR, e => removeAuxNode(e.target))    // remove aux node when removing edge
}

function repositionAuxNodes (node) {
  node.connectedEdges(EDGE_SELECTOR).forEach(edge => {
    const midpoint = edge.midpoint()
    // Note: if Cytoscape can't draw the edge (a warning appears in the browser console) its midpoint is undefined
    // (x and y are NaN). If a node is positioned to such an invalid position its canvas representation becomes corrupt
    // (drawImage() throws "InvalidStateError: The object is in an invalid state" then).
    if (isValidPos(midpoint)) {
      edge.auxNode().unlock().position(midpoint).lock()
    }
  })
}

function removeAuxNode (edge) {
  edge.auxNode().remove()
}

/**
 * Prerequisite: "this" refers to an edge.
 *
 * @return  the aux node (a one-element Cytoscape collection) that represents the given edge.
 */
function auxNode () {
  const edge = this
  if (!edge || !edge.isEdge()) {
    console.warn('auxNode() is called on', edge)
    throw Error('auxNode() is not called on an edge')
  }
  const auxNode = edge.cy().getElementById(auxNodeId(edge))
  if (auxNode.size() !== 1) {
    console.warn('No aux node for edge', edge)
    throw Error(`no aux node for edge ${edge.id()}`)
  }
  return auxNode
}

/**
 * @return  the ID (string) of the aux node of the given edge.
 */
function auxNodeId (edge) {
  const auxNodeId = edge.data('auxNodeId')
  if (!auxNodeId) {
    console.warn('Edge has no "auxNodeId" data', edge)
    throw Error(`edge ${edge.id()} has no "auxNodeId" data`)
  }
  return auxNodeId
}

/**
 * Prerequisite: "this" refers to a node.
 *
 * @return  true if the node is an aux node, false otherwise.
 */
function isAuxNode () {
  return this.edgeId() !== undefined
}

/**
 * Prerequisite: "this" refers to a node.
 *
 * @return  the ID of the edge represented by this aux node.
 *          Returns `undefined` if this is not an aux node (TODO: throw instead?).
 */
function edgeId () {
  const node = this
  if (!node || !node.isNode()) {
    console.warn('edgeId() is called on', node)
    throw Error('edgeId() is not called on a node')
  }
  return node.data('edgeId')
}

function eleId (ele) {
  // Note: Cytoscape element IDs are strings
  return Number(ele.id())
}

function isValidPos(pos) {
  // Global isNan() coerces to number and then checks; Number.isNaN() checks immediately.
  return !(Number.isNaN(pos.x) || Number.isNaN(pos.y))
}
