/**
 * P2P Distributed Server System
 * 
 * Sistema de computación distribuida P2P que distribuye la carga del servidor
 * entre todos los usuarios conectados según la potencia de sus dispositivos.
 * 
 * Arquitectura:
 * - Servidor Orquestador: Asigna roles y valida conexiones
 * - Nodos de Autoridad: PCs potentes que simulan regiones del mundo
 * - Nodos Ligeros: PCs menos potentes que solo renderizan
 * - Validadores: Verifican la integridad de las simulaciones
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[MiniFeather P2P]';
  
  // Configuración del sistema P2P
  const P2P_CONFIG = {
    // Intervalo para evaluar potencia del dispositivo (ms)
    BENCHMARK_INTERVAL: 30000,
    // Intervalo para reportar estado al orquestador (ms)
    STATUS_REPORT_INTERVAL: 5000,
    // Tiempo máximo sin heartbeat antes de considerar nodo offline (ms)
    HEARTBEAT_TIMEOUT: 10000,
    // Número mínimo de validadores por región
    MIN_VALIDATORS_PER_REGION: 2,
    // Umbral mínimo de score para ser nodo de autoridad
    MIN_AUTHORITY_SCORE: 50,
    // Máximo de regiones por nodo de autoridad
    MAX_REGIONS_PER_NODE: 3,
    // Tamaño de región en chunks
    REGION_SIZE_CHUNKS: 4,
    // Factor de ponderación para CPU vs GPU
    CPU_WEIGHT: 0.6,
    GPU_WEIGHT: 0.4
  };

  // Tipos de roles en la red P2P
  const NODE_ROLE = {
    ORCHESTRATOR: 'orchestrator',  // Servidor central de coordinación
    AUTHORITY: 'authority',        // Nodo que simula regiones
    VALIDATOR: 'validator',        // Nodo que valida simulaciones
    LIGHT: 'light',               // Nodo solo cliente
    HYBRID: 'hybrid'              // Nodo que es autoridad y cliente
  };

  // Estados del nodo
  const NODE_STATE = {
    INITIALIZING: 'initializing',
    BENCHMARKING: 'benchmarking',
    CONNECTING: 'connecting',
    ACTIVE: 'active',
    DEGRADED: 'degraded',
    OFFLINE: 'offline'
  };

  // Clase principal del sistema P2P
  class P2PDistributedSystem {
    constructor() {
      this.nodeId = this.generateNodeId();
      this.role = NODE_ROLE.LIGHT;
      this.state = NODE_STATE.INITIALIZING;
      this.peers = new Map();
      this.regions = new Map();
      this.benchmarkScore = 0;
      this.cpuScore = 0;
      this.gpuScore = 0;
      this.memoryGB = 0;
      this.bandwidthMbps = 0;
      this.orchestratorConnection = null;
      this.dataChannels = new Map();
      this.lastHeartbeat = Date.now();
      this.isHost = false;
      
      // Cola de tareas pendientes
      this.taskQueue = [];
      this.activeTasks = new Map();
      
      // Métricas de rendimiento
      this.metrics = {
        framesPerSecond: 0,
        simulationTickRate: 0,
        networkLatency: 0,
        packetLoss: 0,
        uptime: 0
      };

      this.init();
    }

    /**
     * Inicializa el sistema P2P
     */
    async init() {
      log('Iniciando sistema P2P distribuido...');
      
      try {
        // Evaluar capacidad del dispositivo
        await this.runBenchmark();
        
        // Determinar rol inicial basado en benchmark
        this.determineOptimalRole();
        
        // Configurar WebRTC
        await this.setupWebRTC();
        
        // Conectar al orquestador (o actuar como uno si es host)
        if (this.isHost) {
          await this.startAsOrchestrator();
        } else {
          await this.connectToOrchestrator();
        }
        
        // Iniciar loop de monitoreo
        this.startMonitoringLoop();
        
        log(`Sistema P2P iniciado. Rol: ${this.role}, Score: ${this.benchmarkScore}`);
      } catch (error) {
        logError('Error al iniciar sistema P2P:', error);
        this.state = NODE_STATE.DEGRADED;
      }
    }

    /**
     * Genera un ID único para el nodo
     */
    generateNodeId() {
      return 'node_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    /**
     * Ejecuta benchmark para evaluar la potencia del dispositivo
     */
    async runBenchmark() {
      log('Ejecutando benchmark del dispositivo...');
      this.state = NODE_STATE.BENCHMARKING;

      const results = {
        cpu: 0,
        gpu: 0,
        memory: 0,
        network: 0
      };

      // Benchmark de CPU: operaciones matemáticas intensivas
      const cpuStart = performance.now();
      let operations = 0;
      const benchmarkDuration = 1000; // 1 segundo
      
      while (performance.now() - cpuStart < benchmarkDuration) {
        Math.sin(operations);
        Math.cos(operations);
        Math.sqrt(operations);
        operations++;
      }
      
      results.cpu = operations / benchmarkDuration; // operaciones por ms
      this.cpuScore = results.cpu;

      // Benchmark de GPU: crear y manipular canvas WebGL
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (gl) {
          const gpuStart = performance.now();
          let drawCalls = 0;
          
          // Simular múltiples draw calls
          while (performance.now() - gpuStart < 1000) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            drawCalls++;
          }
          
          results.gpu = drawCalls;
          this.gpuScore = results.gpu;
        }
      } catch (e) {
        logWarn('WebGL no disponible, usando valor estimado para GPU');
        this.gpuScore = 1000; // Valor conservador
      }

      // Memoria disponible
      if (navigator.deviceMemory) {
        this.memoryGB = navigator.deviceMemory;
      } else {
        // Estimación basada en user agent
        this.memoryGB = 4; // Valor por defecto conservador
      }
      results.memory = this.memoryGB;

      // Test de red simple
      try {
        const networkStart = performance.now();
        await fetch('data:text/plain,test', { cache: 'no-store' });
        const networkEnd = performance.now();
        results.network = 1000 / (networkEnd - networkStart); // requests por segundo
        this.bandwidthMbps = Math.min(results.network * 0.01, 100); // Estimación Mbps
      } catch (e) {
        this.bandwidthMbps = 10; // Valor conservador
      }

      // Calcular score combinado
      this.benchmarkScore = this.calculateCombinedScore();
      
      log(`Benchmark completado - CPU: ${this.cpuScore.toFixed(2)}, GPU: ${this.gpuScore}, RAM: ${this.memoryGB}GB`);
      this.state = NODE_STATE.CONNECTING;
    }

    /**
     * Calcula el score combinado ponderado
     */
    calculateCombinedScore() {
      // Normalizar scores (valores típicos: CPU ~500-5000 ops/ms, GPU ~1000-10000 draws/s)
      const normalizedCPU = Math.min(this.cpuScore / 5000, 10);
      const normalizedGPU = Math.min(this.gpuScore / 10000, 10);
      const normalizedMemory = Math.min(this.memoryGB / 16, 10);
      const normalizedBandwidth = Math.min(this.bandwidthMbps / 100, 10);

      const computeScore = (normalizedCPU * P2P_CONFIG.CPU_WEIGHT) + 
                          (normalizedGPU * P2P_CONFIG.GPU_WEIGHT);
      
      const totalScore = (computeScore * 0.7) + 
                        ((normalizedMemory + normalizedBandwidth) / 2 * 0.3);
      
      return Math.round(totalScore * 10); // Score de 0-100
    }

    /**
     * Determina el rol óptimo basado en el benchmark
     */
    determineOptimalRole() {
      if (this.benchmarkScore >= P2P_CONFIG.MIN_AUTHORITY_SCORE) {
        if (this.benchmarkScore >= 80) {
          this.role = NODE_ROLE.AUTHORITY;
          log('Dispositivo clasificado como NODO DE AUTORIDAD (alta potencia)');
        } else {
          this.role = NODE_ROLE.HYBRID;
          log('Dispositivo clasificado como NODO HÍBRIDO (potencia media)');
        }
      } else {
        this.role = NODE_ROLE.LIGHT;
        log('Dispositivo clasificado como NODO LIGERO (baja potencia)');
      }
    }

    /**
     * Configura WebRTC para conexiones P2P
     */
    async setupWebRTC() {
      const iceServers = [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
        { 
          urls: 'turn:openrelay.metered.ca:80', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        },
        { 
          urls: 'turn:openrelay.metered.ca:443', 
          username: 'openrelayproject', 
          credential: 'openrelayproject' 
        }
      ];

      this.rtcConfig = {
        iceServers: iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require'
      };

      log('WebRTC configurado con servidores STUN/TURN');
    }

    /**
     * Inicia el nodo como orquestador (host)
     */
    async startAsOrchestrator() {
      log('Iniciando como servidor orquestador...');
      this.isHost = true;
      this.role = NODE_ROLE.ORCHESTRATOR;
      
      // Crear estructura de datos para tracking de nodos
      this.connectedNodes = new Map();
      this.regionAssignments = new Map();
      
      // Suscribirse a eventos de señalización
      this.setupSignalingHandler();
      
      log('Servidor orquestador iniciado. Esperando conexiones...');
    }

    /**
     * Conecta al orquestador existente
     */
    async connectToOrchestrator() {
      log('Conectando al orquestador...');
      
      // Buscar orquestador en la red local o usar URL configurada
      const orchestratorURL = localStorage.getItem('mf:p2p:orchestrator') || 
                             'ws://localhost:8766/p2p';
      
      try {
        this.orchestratorConnection = new WebSocket(orchestratorURL);
        
        this.orchestratorConnection.onopen = () => {
          log('Conectado al orquestador');
          this.registerWithOrchestrator();
        };
        
        this.orchestratorConnection.onmessage = (event) => {
          this.handleOrchestratorMessage(JSON.parse(event.data));
        };
        
        this.orchestratorConnection.onclose = () => {
          logWarn('Desconectado del orquestador, intentando reconectar...');
          setTimeout(() => this.connectToOrchestrator(), 5000);
        };
        
        this.orchestratorConnection.onerror = (error) => {
          logError('Error en conexión con orquestador:', error);
        };
      } catch (error) {
        logError('No se pudo conectar al orquestador:', error);
        this.state = NODE_STATE.DEGRADED;
      }
    }

    /**
     * Registra este nodo con el orquestador
     */
    registerWithOrchestrator() {
      if (!this.orchestratorConnection) return;
      
      const registrationData = {
        type: 'REGISTER',
        nodeId: this.nodeId,
        role: this.role,
        benchmark: {
          score: this.benchmarkScore,
          cpu: this.cpuScore,
          gpu: this.gpuScore,
          memory: this.memoryGB,
          bandwidth: this.bandwidthMbps
        },
        timestamp: Date.now()
      };
      
      this.orchestratorConnection.send(JSON.stringify(registrationData));
      log('Registrado con el orquestador');
    }

    /**
     * Maneja mensajes del orquestador
     */
    handleOrchestratorMessage(message) {
      switch (message.type) {
        case 'ASSIGN_REGION':
          this.assignRegion(message.region);
          break;
        case 'PEER_LIST':
          this.updatePeerList(message.peers);
          break;
        case 'REASSIGN_ROLE':
          this.changeRole(message.newRole);
          break;
        case 'HEARTBEAT_REQUEST':
          this.sendHeartbeat();
          break;
        case 'SHUTDOWN':
          this.gracefulShutdown();
          break;
        default:
          logWarn('Mensaje desconocido del orquestador:', message.type);
      }
    }

    /**
     * Asigna una región a este nodo
     */
    assignRegion(regionData) {
      const { regionId, bounds, entities } = regionData;
      
      log(`Asignada región ${regionId} (${bounds.x}-${bounds.z})`);
      
      this.regions.set(regionId, {
        id: regionId,
        bounds: bounds,
        entities: entities || [],
        lastUpdate: Date.now(),
        tickRate: 20, // ticks por segundo
        loaded: true
      });
      
      this.role = NODE_ROLE.HYBRID;
      this.state = NODE_STATE.ACTIVE;
    }

    /**
     * Actualiza la lista de peers conocidos
     */
    updatePeerList(peers) {
      log(`Actualizada lista de peers: ${peers.length} nodos`);
      
      for (const peer of peers) {
        if (peer.nodeId !== this.nodeId) {
          this.peers.set(peer.nodeId, peer);
          this.attemptPeerConnection(peer);
        }
      }
    }

    /**
     * Intenta establecer conexión con un peer
     */
    async attemptPeerConnection(peerInfo) {
      if (this.dataChannels.has(peerInfo.nodeId)) {
        return; // Ya conectado
      }

      try {
        const connection = new RTCPeerConnection(this.rtcConfig);
        
        // Configurar manejo de ICE candidates
        connection.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalingMessage(peerInfo.nodeId, {
              type: 'ICE_CANDIDATE',
              candidate: event.candidate
            });
          }
        };

        // Crear canal de datos
        const dataChannel = connection.createDataChannel('p2p-game', {
          ordered: false,
          maxRetransmits: 3
        });
        
        this.setupDataChannel(dataChannel, peerInfo.nodeId);
        
        // Crear oferta SDP
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        
        // Enviar oferta vía señalización
        this.sendSignalingMessage(peerInfo.nodeId, {
          type: 'SDP_OFFER',
          sdp: connection.localDescription
        });
        
        this.peers.set(peerInfo.nodeId, {
          ...peerInfo,
          connection: connection,
          state: 'connecting'
        });
        
        log(`Iniciando conexión P2P con ${peerInfo.nodeId}`);
      } catch (error) {
        logError(`Error al conectar con peer ${peerInfo.nodeId}:`, error);
      }
    }

    /**
     * Configura un canal de datos WebRTC
     */
    setupDataChannel(dataChannel, peerId) {
      dataChannel.onopen = () => {
        log(`Canal de datos abierto con ${peerId}`);
        this.dataChannels.set(peerId, dataChannel);
        
        if (this.peers.has(peerId)) {
          this.peers.get(peerId).state = 'connected';
        }
      };

      dataChannel.onmessage = (event) => {
        this.handlePeerMessage(peerId, JSON.parse(event.data));
      };

      dataChannel.onclose = () => {
        log(`Canal de datos cerrado con ${peerId}`);
        this.dataChannels.delete(peerId);
      };

      dataChannel.onerror = (error) => {
        logError(`Error en canal de datos con ${peerId}:`, error);
      };
    }

    /**
     * Maneja mensajes de peers
     */
    handlePeerMessage(peerId, message) {
      switch (message.type) {
        case 'REGION_UPDATE':
          this.processRegionUpdate(peerId, message.data);
          break;
        case 'ENTITY_SYNC':
          this.syncEntities(peerId, message.entities);
          break;
        case 'VALIDATION_REQUEST':
          this.handleValidationRequest(peerId, message);
          break;
        case 'VALIDATION_RESPONSE':
          this.handleValidationResponse(peerId, message);
          break;
        case 'LOAD_BALANCE':
          this.handleLoadBalanceRequest(peerId, message);
          break;
        default:
          logTrace('Mensaje de peer ignorado:', message.type);
      }
    }

    /**
     * Procesa actualización de región de otro nodo
     */
    processRegionUpdate(peerId, regionData) {
      const region = this.regions.get(regionData.regionId);
      if (!region) return;

      // Aplicar actualización solo si es más reciente
      if (regionData.timestamp > region.lastUpdate) {
        region.entities = regionData.entities;
        region.lastUpdate = regionData.timestamp;
        region.tickRate = regionData.tickRate;
      }
    }

    /**
     * Sincroniza entidades con otros nodos
     */
    syncEntities(peerId, entities) {
      // Implementar lógica de sincronización de entidades
      logTrace(`Sincronizando ${entities.length} entidades desde ${peerId}`);
    }

    /**
     * Maneja solicitud de validación
     */
    handleValidationRequest(peerId, request) {
      if (this.role === NODE_ROLE.LIGHT) return;

      // Validar estado de la región
      const isValid = this.validateRegionState(request.regionId, request.stateHash);
      
      this.sendToPeer(peerId, {
        type: 'VALIDATION_RESPONSE',
        regionId: request.regionId,
        valid: isValid,
        timestamp: Date.now()
      });
    }

    /**
     * Valida el estado de una región
     */
    validateRegionState(regionId, stateHash) {
      const region = this.regions.get(regionId);
      if (!region) return false;

      // Calcular hash del estado actual
      const currentHash = this.calculateStateHash(region);
      return currentHash === stateHash;
    }

    /**
     * Calcula hash del estado de una región
     */
    calculateStateHash(region) {
      // Implementar cálculo de hash deterministico
      const stateString = JSON.stringify({
        entities: region.entities.length,
        bounds: region.bounds
      });
      
      // Hash simple (en producción usar SHA-256)
      let hash = 0;
      for (let i = 0; i < stateString.length; i++) {
        const char = stateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      return hash.toString(36);
    }

    /**
     * Maneja solicitud de balanceo de carga
     */
    handleLoadBalanceRequest(peerId, request) {
      if (this.role !== NODE_ROLE.ORCHESTRATOR) return;

      this.redistributeLoad(request.overloadedNode);
    }

    /**
     * Redistribuye carga entre nodos
     */
    redistributeLoad(overloadedNode) {
      log('Redistribuyendo carga del sistema...');
      
      // Identificar nodos con capacidad disponible
      const availableNodes = Array.from(this.connectedNodes.values())
        .filter(node => node.role === NODE_ROLE.AUTHORITY && 
                       node.currentLoad < node.maxCapacity);
      
      // Ordenar por capacidad disponible
      availableNodes.sort((a, b) => b.availableCapacity - a.availableCapacity);
      
      // Reasignar regiones
      if (availableNodes.length > 0 && this.regionAssignments.has(overloadedNode.id)) {
        const regions = this.regionAssignments.get(overloadedNode.id);
        const targetNode = availableNodes[0];
        
        // Transferir primera región
        if (regions.length > 0) {
          const regionToTransfer = regions.pop();
          this.assignRegionToNode(regionToTransfer, targetNode);
        }
      }
    }

    /**
     * Asigna una región a un nodo específico
     */
    assignRegionToNode(region, targetNode) {
      // Notificar al nodo objetivo
      this.sendToNode(targetNode.id, {
        type: 'ASSIGN_REGION',
        region: region
      });
      
      // Actualizar asignaciones
      if (!this.regionAssignments.has(targetNode.id)) {
        this.regionAssignments.set(targetNode.id, []);
      }
      this.regionAssignments.get(targetNode.id).push(region);
      
      log(`Región ${region.id} reasignada a nodo ${targetNode.id}`);
    }

    /**
     * Envía mensaje a un peer específico
     */
    sendToPeer(peerId, message) {
      const channel = this.dataChannels.get(peerId);
      if (channel && channel.readyState === 'open') {
        channel.send(JSON.stringify(message));
        return true;
      }
      return false;
    }

    /**
     * Envía mensaje de señalización
     */
    sendSignalingMessage(peerId, message) {
      if (this.orchestratorConnection) {
        this.orchestratorConnection.send(JSON.stringify({
          type: 'SIGNALING',
          from: this.nodeId,
          to: peerId,
          payload: message
        }));
      }
    }

    /**
     * Configura manejador de señalización
     */
    setupSignalingHandler() {
      // Escuchar eventos personalizados de señalización
      document.addEventListener('minifeather:p2p-signal', (event) => {
        this.handleSignalingEvent(event.detail);
      });
    }

    /**
     * Maneja eventos de señalización
     */
    handleSignalingEvent(signalData) {
      const { from, payload } = signalData;
      
      if (payload.type === 'SDP_OFFER') {
        this.handleSDPOffer(from, payload.sdp);
      } else if (payload.type === 'SDP_ANSWER') {
        this.handleSDPAnswer(from, payload.sdp);
      } else if (payload.type === 'ICE_CANDIDATE') {
        this.handleICECandidate(from, payload.candidate);
      }
    }

    /**
     * Maneja oferta SDP
     */
    async handleSDPOffer(peerId, sdp) {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.connection) return;

      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);

      this.sendSignalingMessage(peerId, {
        type: 'SDP_ANSWER',
        sdp: peer.connection.localDescription
      });
    }

    /**
     * Maneja respuesta SDP
     */
    async handleSDPAnswer(peerId, sdp) {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.connection) return;

      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    /**
     * Maneja candidato ICE
     */
    async handleICECandidate(peerId, candidate) {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.connection) return;

      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        logError(`Error al agregar ICE candidate de ${peerId}:`, error);
      }
    }

    /**
     * Envía heartbeat al orquestador
     */
    sendHeartbeat() {
      if (!this.orchestratorConnection) return;

      const heartbeat = {
        type: 'HEARTBEAT',
        nodeId: this.nodeId,
        metrics: {
          fps: this.metrics.framesPerSecond,
          tickRate: this.metrics.simulationTickRate,
          latency: this.metrics.networkLatency,
          activeRegions: this.regions.size,
          connectedPeers: this.dataChannels.size
        },
        timestamp: Date.now()
      };

      this.orchestratorConnection.send(JSON.stringify(heartbeat));
      this.lastHeartbeat = Date.now();
    }

    /**
     * Inicia loop de monitoreo continuo
     */
    startMonitoringLoop() {
      // Monitorear FPS
      let frameCount = 0;
      let lastFpsUpdate = Date.now();

      const measureFPS = () => {
        frameCount++;
        const now = Date.now();
        if (now - lastFpsUpdate >= 1000) {
          this.metrics.framesPerSecond = frameCount;
          frameCount = 0;
          lastFpsUpdate = now;
        }
        requestAnimationFrame(measureFPS);
      };
      
      requestAnimationFrame(measureFPS);

      // Reportar estado periódicamente
      setInterval(() => {
        this.sendHeartbeat();
        this.checkHealth();
      }, P2P_CONFIG.STATUS_REPORT_INTERVAL);

      // Re-ejecutar benchmark periódicamente
      setInterval(() => {
        this.runBenchmark();
      }, P2P_CONFIG.BENCHMARK_INTERVAL);

      log('Loop de monitoreo iniciado');
    }

    /**
     * Verifica salud del sistema
     */
    checkHealth() {
      const now = Date.now();
      
      // Verificar timeout de heartbeat
      if (now - this.lastHeartbeat > P2P_CONFIG.HEARTBEAT_TIMEOUT) {
        logWarn('Timeout de heartbeat detectado');
        if (this.orchestratorConnection) {
          this.connectToOrchestrator();
        }
      }

      // Verificar regiones activas
      for (const [regionId, region] of this.regions) {
        if (now - region.lastUpdate > 5000 && region.loaded) {
          logWarn(`Región ${regionId} sin actualizaciones recientes`);
          // Solicitar refresh o reasignación
        }
      }

      // Verificar peers
      for (const [peerId, peer] of this.peers) {
        if (peer.state === 'connecting' && now - peer.lastAttempt > 10000) {
          logWarn(`Conexión con ${peerId} estancada, reintentando...`);
          this.attemptPeerConnection(peer);
        }
      }
    }

    /**
     * Cambia el rol del nodo dinámicamente
     */
    changeRole(newRole) {
      if (newRole === this.role) return;

      log(`Cambiando rol de ${this.role} a ${newRole}`);
      this.role = newRole;

      // Ajustar comportamiento según nuevo rol
      if (newRole === NODE_ROLE.LIGHT) {
        // Liberar regiones asignadas
        for (const regionId of this.regions.keys()) {
          this.unloadRegion(regionId);
        }
      } else if (newRole === NODE_ROLE.AUTHORITY) {
        // Solicitar asignación de regiones
        this.requestRegionAssignment();
      }
    }

    /**
     * Solicita asignación de regiones
     */
    requestRegionAssignment() {
      if (this.orchestratorConnection) {
        this.orchestratorConnection.send(JSON.stringify({
          type: 'REQUEST_REGION',
          nodeId: this.nodeId,
          capacity: this.benchmarkScore
        }));
      }
    }

    /**
     * Descarga una región
     */
    unloadRegion(regionId) {
      const region = this.regions.get(regionId);
      if (region) {
        region.loaded = false;
        log(`Región ${regionId} descargada`);
      }
    }

    /**
     * Apagado graceful del nodo
     */
    gracefulShutdown() {
      log('Iniciando apagado graceful...');

      // Notificar al orquestador
      if (this.orchestratorConnection) {
        this.orchestratorConnection.send(JSON.stringify({
          type: 'SHUTDOWN_NOTIFICATION',
          nodeId: this.nodeId,
          regions: Array.from(this.regions.keys())
        }));
      }

      // Cerrar conexiones P2P
      for (const [peerId, channel] of this.dataChannels) {
        channel.close();
      }

      // Cerrar conexión con orquestador
      if (this.orchestratorConnection) {
        this.orchestratorConnection.close();
      }

      this.state = NODE_STATE.OFFLINE;
      log('Nodo apagado correctamente');
    }

    /**
     * Obtiene estadísticas del sistema
     */
    getStats() {
      return {
        nodeId: this.nodeId,
        role: this.role,
        state: this.state,
        benchmarkScore: this.benchmarkScore,
        activeRegions: this.regions.size,
        connectedPeers: this.dataChannels.size,
        metrics: { ...this.metrics },
        uptime: Date.now() - this.lastHeartbeat
      };
    }
  }

  // Funciones de logging
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logWarn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  function logTrace(...args) {
    if (localStorage.getItem('mfp2p:log') === 'trace') {
      console.log(LOG_PREFIX, '[trace]', ...args);
    }
  }

  // Exportar singleton global
  window.MiniFeatherP2P = new P2PDistributedSystem();

  // Eventos públicos
  document.dispatchEvent(new CustomEvent('minifeather:p2p-initialized', {
    detail: {
      nodeId: window.MiniFeatherP2P.nodeId,
      role: window.MiniFeatherP2P.role,
      benchmarkScore: window.MiniFeatherP2P.benchmarkScore
    }
  }));

  log('Sistema P2P distribuido cargado exitosamente');

})();
