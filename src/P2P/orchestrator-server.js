
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const CONFIG = {
  PORT: process.env.P2P_PORT || 8766,
  HEARTBEAT_TIMEOUT: 10000,
  REBALANCE_THRESHOLD: 0.8, 
  VALIDATION_INTERVAL: 5000,
  MAX_REGIONS_PER_NODE: 3,
  REGION_SIZE: 4 
};

const NODE_STATE = {
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  OFFLINE: 'offline'
};

const NODE_ROLE = {
  ORCHESTRATOR: 'orchestrator',
  AUTHORITY: 'authority',
  VALIDATOR: 'validator',
  LIGHT: 'light',
  HYBRID: 'hybrid'
};

class P2POrchestrator {
  constructor() {
    this.nodes = new Map();
    this.regions = new Map();
    this.pendingSignals = new Map();
    this.worldBounds = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };
    
    this.initServer();
    this.startValidationLoop();
    
    console.log('[P2P Orchestrator] Servidor iniciado en puerto', CONFIG.PORT);
  }

  initServer() {
    
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          nodes: this.nodes.size,
          regions: this.regions.size,
          uptime: process.uptime()
        }));
      } else if (req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStats()));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      path: '/p2p'
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.httpServer.listen(CONFIG.PORT, () => {
      console.log(`[P2P Orchestrator] Escuchando en ws://localhost:${CONFIG.PORT}/p2p`);
    });
  }

  handleConnection(ws, req) {
    const nodeId = 'node_' + crypto.randomBytes(8).toString('hex');
    ws.nodeId = nodeId;
    ws.state = NODE_STATE.CONNECTING;
    
    console.log(`[P2P Orchestrator] Nueva conexión: ${nodeId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[P2P Orchestrator] Error al procesar mensaje:', error);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error(`[P2P Orchestrator] Error en nodo ${nodeId}:`, error);
    });

    ws.connectionTimeout = setTimeout(() => {
      if (ws.state === NODE_STATE.CONNECTING) {
        console.warn(`[P2P Orchestrator] Timeout de conexión para ${nodeId}`);
        ws.close();
      }
    }, 10000);
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case 'REGISTER':
        this.handleRegister(ws, message);
        break;
      case 'HEARTBEAT':
        this.handleHeartbeat(ws, message);
        break;
      case 'SIGNALING':
        this.handleSignaling(ws, message);
        break;
      case 'REQUEST_REGION':
        this.handleRegionRequest(ws, message);
        break;
      case 'SHUTDOWN_NOTIFICATION':
        this.handleShutdownNotification(ws, message);
        break;
      default:
        console.warn('[P2P Orchestrator] Mensaje desconocido:', message.type);
    }
  }

  handleRegister(ws, message) {
    clearTimeout(ws.connectionTimeout);

    const nodeData = {
      id: ws.nodeId,
      role: message.role,
      benchmark: message.benchmark,
      state: NODE_STATE.ACTIVE,
      ws: ws,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      assignedRegions: [],
      currentLoad: 0,
      maxCapacity: message.benchmark.score
    };

    this.nodes.set(ws.nodeId, nodeData);
    ws.state = NODE_STATE.ACTIVE;

    console.log(`[P2P Orchestrator] Nodo registrado: ${ws.nodeId} (rol: ${message.role}, score: ${message.benchmark.score})`);

    if (message.role === NODE_ROLE.AUTHORITY || message.role === NODE_ROLE.HYBRID) {
      this.assignRegionsToNode(nodeData);
    }

    this.sendPeerList(ws);
  }

  handleHeartbeat(ws, message) {
    const node = this.nodes.get(ws.nodeId);
    if (!node) return;

    node.lastHeartbeat = Date.now();
    node.metrics = message.metrics;

    if (message.metrics && message.metrics.activeRegions) {
      node.currentLoad = message.metrics.activeRegions / CONFIG.MAX_REGIONS_PER_NODE;
      
      if (node.currentLoad > CONFIG.REBALANCE_THRESHOLD) {
        this.triggerRebalance(ws.nodeId);
      }
    }
  }

  handleSignaling(ws, message) {
    const targetNode = this.nodes.get(message.to);
    if (!targetNode || !targetNode.ws || targetNode.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    targetNode.ws.send(JSON.stringify({
      type: 'SIGNALING',
      from: message.from,
      payload: message.payload
    }));
  }

  handleRegionRequest(ws, message) {
    const node = this.nodes.get(ws.nodeId);
    if (!node) return;

    if (node.role === NODE_ROLE.AUTHORITY || node.role === NODE_ROLE.HYBRID) {
      this.assignRegionsToNode(node);
    }
  }

  handleShutdownNotification(ws, message) {
    console.log(`[P2P Orchestrator] Nodo ${ws.nodeId} notificando apagado`);
    
    const node = this.nodes.get(ws.nodeId);
    if (node && node.assignedRegions.length > 0) {
      this.reassignRegions(node.assignedRegions, ws.nodeId);
    }

    this.nodes.delete(ws.nodeId);
  }

  handleDisconnect(ws) {
    console.log(`[P2P Orchestrator] Nodo desconectado: ${ws.nodeId}`);
    
    const node = this.nodes.get(ws.nodeId);
    if (node) {
      
      if (node.assignedRegions.length > 0) {
        this.reassignRegions(node.assignedRegions, ws.nodeId);
      }
      
      this.nodes.delete(ws.nodeId);
    }

    this.broadcastPeerList();
  }

  assignRegionsToNode(node) {
    const availableRegions = this.findAvailableRegions();
    const maxRegions = Math.min(
      CONFIG.MAX_REGIONS_PER_NODE,
      Math.floor(node.maxCapacity / 30) 
    );

    for (let i = 0; i < maxRegions && availableRegions.length > 0; i++) {
      const region = availableRegions.shift();
      this.assignRegionToNode(region, node);
    }
  }

  findAvailableRegions() {
    const assigned = new Set();
    for (const node of this.nodes.values()) {
      for (const regionId of node.assignedRegions) {
        assigned.add(regionId);
      }
    }

    const available = [];
    const worldSizeX = this.worldBounds.maxX - this.worldBounds.minX;
    const worldSizeZ = this.worldBounds.maxZ - this.worldBounds.minZ;
    
    const numRegionsX = Math.ceil(worldSizeX / (CONFIG.REGION_SIZE * 16));
    const numRegionsZ = Math.ceil(worldSizeZ / (CONFIG.REGION_SIZE * 16));

    for (let x = 0; x < numRegionsX; x++) {
      for (let z = 0; z < numRegionsZ; z++) {
        const regionId = `region_${x}_${z}`;
        if (!assigned.has(regionId)) {
          available.push({
            id: regionId,
            bounds: {
              x: this.worldBounds.minX + x * CONFIG.REGION_SIZE * 16,
              z: this.worldBounds.minZ + z * CONFIG.REGION_SIZE * 16,
              size: CONFIG.REGION_SIZE * 16
            }
          });
        }
      }
    }

    return available;
  }

  assignRegionToNode(region, node) {
    node.assignedRegions.push(region.id);
    this.regions.set(region.id, {
      ...region,
      assignedTo: node.id,
      assignedAt: Date.now()
    });

    node.ws.send(JSON.stringify({
      type: 'ASSIGN_REGION',
      region: region
    }));

    console.log(`[P2P Orchestrator] Región ${region.id} asignada a ${node.id}`);
  }

  reassignRegions(regions, fromNodeId) {
    
    const availableNodes = Array.from(this.nodes.values())
      .filter(node => 
        node.role === NODE_ROLE.AUTHORITY || node.role === NODE_ROLE.HYBRID
      )
      .filter(node => node.assignedRegions.length < CONFIG.MAX_REGIONS_PER_NODE)
      .sort((a, b) => {
        const loadA = a.assignedRegions.length / a.maxCapacity;
        const loadB = b.assignedRegions.length / b.maxCapacity;
        return loadA - loadB; 
      });

    for (const regionId of regions) {
      if (availableNodes.length === 0) break;

      const targetNode = availableNodes[0];
      const region = this.regions.get(regionId);
      
      if (region) {
        this.assignRegionToNode(region, targetNode);
        
        if (targetNode.assignedRegions.length >= CONFIG.MAX_REGIONS_PER_NODE) {
          availableNodes.shift();
        }
      }
    }
  }

  triggerRebalance(overloadedNodeId) {
    const overloadedNode = this.nodes.get(overloadedNodeId);
    if (!overloadedNode || overloadedNode.assignedRegions.length === 0) return;

    console.log(`[P2P Orchestrator] Iniciando rebalanceo para nodo sobrecargado: ${overloadedNodeId}`);

    const availableNodes = Array.from(this.nodes.values())
      .filter(node => 
        node.id !== overloadedNodeId &&
        (node.role === NODE_ROLE.AUTHORITY || node.role === NODE_ROLE.HYBRID) &&
        node.assignedRegions.length < CONFIG.MAX_REGIONS_PER_NODE
      )
      .sort((a, b) => {
        const loadA = a.assignedRegions.length / a.maxCapacity;
        const loadB = b.assignedRegions.length / b.maxCapacity;
        return loadA - loadB;
      });

    if (availableNodes.length > 0) {
      const targetNode = availableNodes[0];
      const regionId = overloadedNode.assignedRegions.pop();
      const region = this.regions.get(regionId);

      if (region) {
        this.assignRegionToNode(region, targetNode);
        console.log(`[P2P Orchestrator] Región ${regionId} transferida de ${overloadedNodeId} a ${targetNode.id}`);
      }
    }
  }

  sendPeerList(ws) {
    const peerList = Array.from(this.nodes.values())
      .filter(node => node.id !== ws.nodeId && node.state === NODE_STATE.ACTIVE)
      .map(node => ({
        nodeId: node.id,
        role: node.role,
        benchmark: node.benchmark
      }));

    ws.send(JSON.stringify({
      type: 'PEER_LIST',
      peers: peerList
    }));
  }

  broadcastPeerList() {
    for (const node of this.nodes.values()) {
      if (node.ws.readyState === WebSocket.OPEN) {
        this.sendPeerList(node.ws);
      }
    }
  }

  startValidationLoop() {
    setInterval(() => {
      this.validateNodes();
    }, CONFIG.VALIDATION_INTERVAL);
  }

  validateNodes() {
    const now = Date.now();
    
    for (const [nodeId, node] of this.nodes.entries()) {
      if (now - node.lastHeartbeat > CONFIG.HEARTBEAT_TIMEOUT) {
        console.warn(`[P2P Orchestrator] Nodo sin heartbeat: ${nodeId}`);
        node.state = NODE_STATE.DEGRADED;
        
        if (now - node.lastHeartbeat > CONFIG.HEARTBEAT_TIMEOUT * 2) {
          console.log(`[P2P Orchestrator] Nodo marcado como offline: ${nodeId}`);
          node.state = NODE_STATE.OFFLINE;
          
          if (node.assignedRegions.length > 0) {
            this.reassignRegions(node.assignedRegions, nodeId);
          }
        }
      }
    }

    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.state === NODE_STATE.OFFLINE) {
        this.nodes.delete(nodeId);
      }
    }
  }

  getStats() {
    const nodesByRole = {};
    for (const role of Object.values(NODE_ROLE)) {
      nodesByRole[role] = 0;
    }

    let totalLoad = 0;
    let totalCapacity = 0;

    for (const node of this.nodes.values()) {
      nodesByRole[node.role]++;
      totalLoad += node.currentLoad;
      totalCapacity += node.maxCapacity;
    }

    return {
      totalNodes: this.nodes.size,
      nodesByRole: nodesByRole,
      totalRegions: this.regions.size,
      averageLoad: this.nodes.size > 0 ? totalLoad / this.nodes.size : 0,
      totalCapacity: totalCapacity,
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }
}

const orchestrator = new P2POrchestrator();

process.on('SIGINT', () => {
  console.log('\n[P2P Orchestrator] Cerrando servidor...');
  
  for (const node of orchestrator.nodes.values()) {
    if (node.ws.readyState === WebSocket.OPEN) {
      node.ws.send(JSON.stringify({
        type: 'SHUTDOWN',
        reason: 'server_shutdown'
      }));
    }
  }

  orchestrator.wss.close();
  orchestrator.httpServer.close(() => {
    console.log('[P2P Orchestrator] Servidor cerrado');
    process.exit(0);
  });
});

module.exports = orchestrator;
