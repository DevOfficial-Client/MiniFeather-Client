# Sistema P2P Distribuido para MiniFeather

## Descripción

Sistema de computación distribuida P2P que permite crear un servidor global donde la carga se reparte entre todos los usuarios conectados según la potencia de sus dispositivos.

## Arquitectura

### Componentes Principales

1. **Servidor Orquestador** (`orchestrator-server.js`)
   - Coordina toda la red P2P
   - Asigna regiones a nodos según su capacidad
   - Maneja balanceo de carga dinámico
   - Valida integridad del sistema

2. **Cliente P2P** (`DistributedServer.js`)
   - Se ejecuta en el navegador de cada usuario
   - Evalúa automáticamente la potencia del dispositivo
   - Se auto-organiza según capacidades

### Roles de los Nodos

| Rol | Descripción | Requisitos Mínimos |
|-----|-------------|-------------------|
| **ORCHESTRATOR** | Servidor central de coordinación | Siempre en un servidor dedicado |
| **AUTHORITY** | Simula regiones completas del mundo | Score ≥ 80 (PCs potentes) |
| **HYBRID** | Es autoridad y cliente simultáneamente | Score 50-79 (PCs medias) |
| **LIGHT** | Solo renderiza, no simula | Score < 50 (PCs débiles/móviles) |
| **VALIDATOR** | Verifica integridad de simulaciones | Cualquier nodo no-light |

## Flujo de Funcionamiento

### 1. Benchmark Inicial

Cuando un usuario se conecta, el sistema evalúa:
- **CPU**: Operaciones matemáticas por milisegundo
- **GPU**: Draw calls WebGL por segundo
- **RAM**: Memoria disponible (GB)
- **Red**: Ancho de banda estimado (Mbps)

```javascript
// Ejemplo de scores típicos:
// PC Gaming alta gama: 85-100
// PC media: 50-79
// Laptop básica: 30-49
// Móvil gama alta: 40-60
// Móvil gama baja: < 40
```

### 2. Asignación de Roles

Basado en el benchmark, el orquestador asigna:
- **Nodos Authority**: Reciben 1-3 regiones de 4x4 chunks cada una
- **Nodos Hybrid**: Reciben 1 región + pueden ser clientes
- **Nodos Light**: Solo reciben datos de otros nodos

### 3. Distribución de Carga

La carga se distribuye proporcionalmente:
```
Regiones asignadas = min(3, floor(benchmarkScore / 30))
```

Ejemplos:
- Score 90 → 3 regiones
- Score 60 → 2 regiones
- Score 40 → 1 región
- Score 25 → 0 regiones (solo cliente)

### 4. Balanceo Dinámico

El sistema monitorea constantemente:
- FPS de cada nodo
- Tick rate de simulación
- Latencia de red
- Pérdida de paquetes

Si un nodo está sobrecargado (>80% capacidad):
1. El orquestador detecta la sobrecarga
2. Identifica nodos con capacidad disponible
3. Transfiere regiones automáticamente
4. Notifica a todos los peers afectados

## Instalación

### Servidor Orquestador

```bash
# Instalar dependencias
npm install ws

# Iniciar servidor
node src/P2P/orchestrator-server.js

# O con puerto personalizado
P2P_PORT=9000 node src/P2P/orchestrator-server.js
```

### Cliente (Navegador)

El cliente se carga automáticamente en el juego:

```html
<script src="src/P2P/DistributedServer.js"></script>
```

O habilitarlo manualmente:
```javascript
localStorage.setItem('mf:p2p:enabled', '1');
localStorage.setItem('mf:p2p:orchestrator', 'ws://tu-servidor:8766/p2p');
```

## Configuración

### Variables del Servidor

```javascript
const CONFIG = {
  PORT: 8766,                    // Puerto WebSocket
  HEARTBEAT_TIMEOUT: 10000,      // Timeout sin heartbeat (ms)
  REBALANCE_THRESHOLD: 0.8,      // 80% = trigger rebalanceo
  VALIDATION_INTERVAL: 5000,     // Validar nodos cada 5s
  MAX_REGIONS_PER_NODE: 3,       // Máximo regiones por nodo
  REGION_SIZE: 4                 // Tamaño de región en chunks
};
```

### Variables del Cliente

```javascript
const P2P_CONFIG = {
  BENCHMARK_INTERVAL: 30000,     // Re-evaluar potencia cada 30s
  STATUS_REPORT_INTERVAL: 5000,  // Reportar estado cada 5s
  MIN_AUTHORITY_SCORE: 50,       // Score mínimo para ser authority
  CPU_WEIGHT: 0.6,               // Peso de CPU en score
  GPU_WEIGHT: 0.4                // Peso de GPU en score
};
```

## API del Sistema

### Eventos del Cliente

```javascript
// Cuando el sistema P2P se inicializa
document.addEventListener('minifeather:p2p-initialized', (e) => {
  console.log('Node ID:', e.detail.nodeId);
  console.log('Rol asignado:', e.detail.role);
  console.log('Benchmark score:', e.detail.benchmarkScore);
});

// Para debug avanzado
localStorage.setItem('mfp2p:log', 'trace'); // Logs detallados
```

### Métodos Públicos

```javascript
// Obtener estadísticas del sistema
const stats = window.MiniFeatherP2P.getStats();
console.log(stats);
/*
{
  nodeId: "node_abc123",
  role: "authority",
  state: "active",
  benchmarkScore: 75,
  activeRegions: 2,
  connectedPeers: 5,
  metrics: { fps: 60, tickRate: 20, latency: 45 }
}
*/
```

### Endpoints del Servidor

```bash
# Health check
curl http://localhost:8766/health

# Estadísticas detalladas
curl http://localhost:8766/stats
```

## Seguridad

### Validación de Estado

Cada región tiene validadores que:
1. Calculan hash del estado periódicamente
2. Comparan hashes entre nodos
3. Reportan inconsistencias al orquestador

### Prevención de Cheating

- Los nodos light no pueden modificar el estado del mundo
- Las actualizaciones de región están firmadas
- Múltiples validadores por región previenen colusión

## Consideraciones de Red

### NAT Traversal

El sistema usa:
- **STUN**: Para descubrimiento de IP pública
- **TURN**: Como fallback cuando P2P directo falla
- Servidores configurados:
  - `stun:stun.cloudflare.com:3478`
  - `turn:openrelay.metered.ca:80` (gratuito)

### Ancho de Banda Estimado

| Rol | Upload | Download |
|-----|--------|----------|
| Authority | 2-5 Mbps | 1-3 Mbps |
| Hybrid | 1-3 Mbps | 2-5 Mbps |
| Light | 0.5 Mbps | 3-8 Mbps |

## Limitaciones

1. **Conectividad**: Algunos firewalls/CGNAT pueden bloquear P2P
2. **Persistencia**: Si todos los nodos se desconectan, el estado se pierde
3. **Seguridad**: Validación client-side es inherentemente menos segura que server-side
4. **Latencia**: Comunicación P2P puede tener más latencia que servidor dedicado

## Casos de Uso Ideales

✅ **Recomendado para:**
- Mundos sandbox entre amigos
- Servidores comunitarios pequeños (< 20 jugadores)
- Prototipado y desarrollo
- Eventos temporales

❌ **No recomendado para:**
- Juegos competitivos que requieren anti-cheat fuerte
- Mundos persistentes críticos
- Más de 50 jugadores simultáneos

## Troubleshooting

### Problema: No conecta al orquestador
```javascript
// Verificar que el servidor esté corriendo
curl http://localhost:8766/health

// Configurar URL correcta
localStorage.setItem('mf:p2p:orchestrator', 'ws://IP_DEL_SERVIDOR:8766/p2p');
```

### Problema: Score muy bajo
```javascript
// Cerrar otras aplicaciones para liberar CPU/RAM
// Usar navegador basado en Chromium (mejor soporte WebGL)
// Verificar aceleración por hardware activada
```

### Problema: Conexiones P2P fallan
```javascript
// Habilitar logs detallados
localStorage.setItem('mfp2p:log', 'trace');

// Verificar firewall permite WebRTC
// El servidor TURN ayuda en redes restrictivas
```

## Futuras Mejoras

- [ ] Criptografía E2E para canales de datos
- [ ] Persistencia en base de datos distribuida
- [ ] Sistema de reputación para nodos
- [ ] Compresión de datos de región
- [ ] Predicción de movimiento para reducir latencia
- [ ] Soporte para móviles optimizado

## Licencia

MIT License - Ver LICENSE en el repositorio principal.
