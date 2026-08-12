(function () {
   'use strict';       
   const TAG = '[MiniFeather Armor HUD]';       
   // CONFIG      
   const CONFIG = {       
       right: 18,
       bottom: 18,       
       iconSize: 44,       
       gap: 10,       
       // 'percentage' = show 95%
       // 'bar'        = show durability bar
       // 'both'       = show percentage + bar    
       durabilityDisplay: 'both',       
       durabilityBarHeight: 4,       
       updateInterval: 150,       
       atlas:
           'https://miniblox.io/textures/spritesheet.36511680aea3.png',       
       atlasSize: 1024,
       tileSize: 16
   };       
   const SLOT_NAMES = [
       'helmet',
       'chestplate',
       'leggings',
       'boots'
   ];          
   let root = null;
   let slots = [];
   let heldItemSlot = null;       
   let lastSignature = '';   
   let enabled = false;

   const DEFAULT_LAYOUT = {
        helmet: {
            x: 0.94,
            y: 0.63
        },
        chestplate: {
            x: 0.94,
            y: 0.70
        },
        leggings: {
            x: 0.94,
            y: 0.77
        },
        boots: {
            x: 0.94,
            y: 0.84
        }
    };

    let layout = loadLayout();
    
    function loadLayout() {
        try {
            const saved =
                JSON.parse(
                    localStorage.getItem(
                        'minifeather-armor-hud-layout'
                    )
                );
            
            if (!saved || typeof saved !== 'object') {
                return structuredClone(DEFAULT_LAYOUT);
            }
        
            const result = structuredClone(DEFAULT_LAYOUT);
        
            for (const name of SLOT_NAMES) {
                if (
                    Number.isFinite(saved[name]?.x) &&
                    Number.isFinite(saved[name]?.y)
                ) {
                    result[name] = {
                        x: Math.max(
                            0,
                            Math.min(1, saved[name].x)
                        ),
                        y: Math.max(
                            0,
                            Math.min(1, saved[name].y)
                        )
                    };
                }
            }
        
            return result;
        } catch (_) {
            return structuredClone(DEFAULT_LAYOUT);
        }
    }
    
    function saveLayout(value) {
        try {
            localStorage.setItem(
                'minifeather-armor-hud-layout',
                JSON.stringify(value)
            );
        } catch (_) {}
    }
    
    function applyPositions() {
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
        
            if (!slot?.root) continue;
        
            const name =
                SLOT_NAMES[i];
        
            const position =
                layout[name];
        
            if (!position) continue;
        
            slot.root.style.position = 'fixed';
        
            slot.root.style.left =
                `${position.x * 100}vw`;
        
            slot.root.style.top =
                `${position.y * 100}vh`;
        
            slot.root.style.right = 'auto';
            slot.root.style.bottom = 'auto';
        
            slot.root.style.transform =
                'translate(-50%, -50%)';
        }
    }
   
   function handleConfig(event) {
        let config;     
        try {
            config =
                typeof event.detail === 'string'
                    ? JSON.parse(event.detail)
                    : event.detail;
        } catch (_) {
            return;
        }       
        if (!config) {
            return;
        }       
        enabled = !!config.enabled;     
        if (root) {
            root.style.display =
                enabled ? 'flex' : 'none';
        }       
        if (enabled) {
            lastSignature = '';
            update();
        }
    }

    document.addEventListener(
        'minifeather:armorhud-config',
        handleConfig
    );

    function handleLayout(event) {
        let positions;      
        try {
            positions =
                typeof event.detail === 'string'
                    ? JSON.parse(event.detail)
                    : event.detail;
        } catch (error) {
            console.error(
                TAG,
                'Failed to read armor HUD layout',
                error
            );
            return;
        }       
        if (
            !positions ||
            typeof positions !== 'object'
        ) {
            return;
        }       
        for (const name of SLOT_NAMES) {
            const position =
                positions[name];        
            if (!position) continue;        
            if (
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y)
            ) {
                continue;
            }       
            layout[name] = {
                x: Math.max(
                    0,
                    Math.min(1, position.x)
                ),      
                y: Math.max(
                    0,
                    Math.min(1, position.y)
                )
            };
        }       
        saveLayout(layout);     
        applyPositions();       
        console.log(
            TAG,
            '✓ Armor HUD layout applied:',
            layout
        );
    }

    document.addEventListener(
        'minifeather:armorhud-layout',
        handleLayout
    );
     
   function getGame() {       
       if (window.miniblox) {
           return window.miniblox;
       }       
       if (window.game) {
           return window.game;
       }       
       return null;
   }       
   function getArmor() {       
       const game = getGame();       
       const armor =
           game?.player?.inventory?.armor;       
       if (!Array.isArray(armor)) {
           return null;
       }       
       return armor;
   }       
   function inGame() {       
       const game = getGame();       
       if (!game) {
           return false;
       }       
       if (typeof game.inGame === 'function') {       
           try {
               return game.inGame();
           } catch (_) {}
       }       
       return !!game.player?.inventory;
   }            
   function getSpriteMap() {       
       const map = window.spriteMap;       
       if (
           !map ||
           typeof map.get !== 'function'
       ) {
           return null;
       }       
       return map;
   }       
   function getSprite(itemName) {       
       const map = getSpriteMap();       
       if (!map || !itemName) {
           return null;
       }       
       return map.get(itemName) || null;
   }           
   function applySprite(element, itemName) {       
       const sprite =
           getSprite(itemName);       
       if (!sprite) {       
           element.style.backgroundImage =
               'none';       
           return false;
       }       
       const sourceX =
           sprite.x * CONFIG.tileSize;       
       const sourceY =
           sprite.y * CONFIG.tileSize;       
       const scale =
           CONFIG.iconSize /
           CONFIG.tileSize;       
       const atlasDisplaySize =
           CONFIG.atlasSize * scale;       
       element.style.backgroundImage =
           `url("${CONFIG.atlas}")`;       
       element.style.backgroundSize =
           `${atlasDisplaySize}px ${atlasDisplaySize}px`;       
       element.style.backgroundPosition =
           `${-sourceX * scale}px ${-sourceY * scale}px`;       
       element.style.backgroundRepeat =
           'no-repeat';       
       element.style.imageRendering =
           'pixelated';       
       return true;
   }          
   function getDurabilityInfo(stack) {       
       if (!stack?.item) {
           return null;
       }       
       const item =
           stack.item;       
       const maxDurability =
           Number(item.maxDurability);       
       if (
           !Number.isFinite(maxDurability) ||
           maxDurability <= 0
       ) {
           return null;
       }       
       const damage =
           Number(stack.itemDamage) || 0;       
       const remaining =
           Math.max(
               0,
               maxDurability - damage
           );       
       const ratio =
           Math.max(
               0,
               Math.min(
                   1,
                   remaining / maxDurability
               )
           );       
       return {
           remaining,
           maximum: maxDurability,
           ratio,
           percent: Math.round(ratio * 100)
       };
   }           
   function durabilityColor(ratio) {       
       if (ratio <= 0.15) {
           return '#ff3b30';
       }       
       if (ratio <= 0.35) {
           return '#ff9500';
       }       
       if (ratio <= 0.60) {
           return '#ffd60a';
       }       
       return '#30d158';
   }        
   function updateDurabilityDisplay(slot, durability) {       
       const mode =
           CONFIG.durabilityDisplay;       
       const showPercentage =
           mode === 'percentage' ||
           mode === 'both';       
       const showBar =
           mode === 'bar' ||
           mode === 'both';             
       if (!durability) {       
           slot.durabilityTrack.style.display =
               'none';       
           slot.percentage.style.display =
               'none';       
           return;
       }            
       if (showPercentage) {       
           slot.percentage.style.display =
               'block';       
           slot.percentage.textContent =
               `${durability.percent}%`;       
           slot.percentage.style.color =
               durabilityColor(
                   durability.ratio
               );       
       } else {       
           slot.percentage.style.display =
               'none';
       }            
       if (showBar) {       
           slot.durabilityTrack.style.display =
               'block';       
           slot.durabilityFill.style.width =
               `${durability.ratio * 100}%`;       
           slot.durabilityFill.style.background =
               durabilityColor(
                   durability.ratio
               );       
       } else {       
           slot.durabilityTrack.style.display =
               'none';
       }
   }            
   function createSlot(index) {       
       const slot =
           document.createElement('div');       
       slot.className =
           'mf-armor-slot';       
       slot.dataset.slot =
           SLOT_NAMES[index];          
       const icon =
           document.createElement('div');       
       icon.className =
           'mf-armor-icon';            
       const durabilityTrack =
           document.createElement('div');       
       durabilityTrack.className =
           'mf-armor-durability-track';              
       const durabilityFill =
           document.createElement('div');       
       durabilityFill.className =
           'mf-armor-durability-fill';       
       durabilityTrack.appendChild(
           durabilityFill
       );             
       const percentage =
           document.createElement('div');       
       percentage.className =
           'mf-armor-percent';          
       slot.appendChild(icon);
       slot.appendChild(durabilityTrack);
       slot.appendChild(percentage);       
       root.appendChild(slot);             
       Object.assign(
           slot.style,
           {
               position: 'relative',       
               width:
                   `${CONFIG.iconSize}px`,       
               height:
                   `${CONFIG.iconSize + 17}px`,       
               display: 'flex',       
               flexDirection: 'column',       
               alignItems: 'center',       
               justifyContent: 'flex-start',       
               background: 'transparent',       
               border: 'none',       
               boxShadow: 'none'
           }
       );             
       Object.assign(
           icon.style,
           {
               width:
                   `${CONFIG.iconSize}px`,       
               height:
                   `${CONFIG.iconSize}px`,       
               backgroundRepeat:
                   'no-repeat',       
               imageRendering:
                   'pixelated',       
               flexShrink: '0'
           }
       );       
       // DURABILITY BAR 
       Object.assign(
           durabilityTrack.style,
           {
               position: 'absolute',       
               left: '2px',       
               right: '2px',       
               bottom: '1px',       
               height:
                   `${CONFIG.durabilityBarHeight}px`,       
               background:
                   'rgba(0,0,0,0.65)',       
               borderRadius: '2px',       
               overflow: 'hidden'
           }
       );       
       Object.assign(
           durabilityFill.style,
           {
               height: '100%',       
               width: '0%',       
               transition:
                   'width 100ms linear',       
               borderRadius: '2px'
           }
       );       
       // PERCENTAGE      
       Object.assign(
           percentage.style,
           {
               position: 'absolute',       
               left: '50%',       
               bottom: '5px',       
               transform:
                   'translateX(-50%)',       
               font:
                   '10px Arial, sans-serif',       
               fontWeight:
                   'bold',       
               whiteSpace:
                   'nowrap',       
               color:
                   'white',       
               textShadow:
                   '0 1px 2px black',       
               pointerEvents:
                   'none'
           }
       );       
       return {
           root: slot,
           icon,
           durabilityTrack,
           durabilityFill,
           percentage
       };
   }
   function createHeldItemSlot() {
        const slot =
            document.createElement('div');      
        slot.className =
            'mf-held-item-slot';        
        const icon =
            document.createElement('canvas');
        icon.width = CONFIG.iconSize;
        icon.height = CONFIG.iconSize;      
        icon.className =
            'mf-held-item-icon';        
        const durabilityTrack =
            document.createElement('div');      
        durabilityTrack.className =
            'mf-held-item-durability-track';        
        const durabilityFill =
            document.createElement('div');      
        durabilityFill.className =
            'mf-held-item-durability-fill';     
        durabilityTrack.appendChild(
            durabilityFill
        );      
        const percentage =
            document.createElement('div');      
        percentage.className =
            'mf-held-item-percent';     
        slot.appendChild(icon);
        slot.appendChild(durabilityTrack);
        slot.appendChild(percentage);       
        root.appendChild(slot);     
        Object.assign(slot.style, {
            position: 'relative',       
            width:
                `${CONFIG.iconSize}px`,     
            height:
                `${CONFIG.iconSize + 17}px`,        
            display: 'flex',        
            flexDirection: 'column',        
            alignItems: 'center',       
            justifyContent: 'flex-start',       
            background: 'transparent',      
            border: 'none'
        });     
        Object.assign(icon.style, {
            width:
                `${CONFIG.iconSize}px`,
            height:
                `${CONFIG.iconSize}px`,
            imageRendering:
                'pixelated',
            display:
                'block',               
            flexShrink:
                '0'
        });     
        Object.assign(
            durabilityTrack.style,
            {
                position: 'absolute',       
                left: '2px',
                right: '2px',
                bottom: '1px',      
                height:
                    `${CONFIG.durabilityBarHeight}px`,      
                background:
                    'rgba(0,0,0,0.65)',     
                borderRadius: '2px',        
                overflow: 'hidden',     
                display: 'none'
            }
        );      
        Object.assign(
            durabilityFill.style,
            {
                height: '100%',
                width: '0%',        
                transition:
                    'width 100ms linear',       
                borderRadius: '2px'
            }
        );      
        Object.assign(
            percentage.style,
            {
                position: 'absolute',       
                left: '50%',
                bottom: '5px',      
                transform:
                    'translateX(-50%)',     
                font:
                    '10px Arial, sans-serif',       
                fontWeight: 'bold',     
                whiteSpace: 'nowrap',       
                color: 'white',     
                textShadow:
                    '0 1px 2px black',      
                pointerEvents: 'none',      
                display: 'none'
            }
        );      
        return {
            root: slot,
            icon,
            durabilityTrack,
            durabilityFill,
            percentage
        };
    }
    function getHeldItem() {
        const game = getGame();     
        const inventory =
            game?.player?.inventory;        
        if (!inventory) {
            return null;
        }       
        const selected =
            inventory.currentItem;      
        const main =
            inventory.main;     
        if (
            !Array.isArray(main) ||
            !Number.isInteger(selected)
        ) {
            return null;
        }       
        return main[selected] || null;
    }
    console.log(
        '[MiniFeather Held Item]',
        getHeldItem()
    );
    function updateHeldItem() {
        if (!heldItemSlot) {
            return;
        }       
        const stack = getHeldItem();        
        if (!stack || !stack.item) {
            heldItemSlot.root.style.display = 'none';
            return;
        }       
        heldItemSlot.root.style.display = 'flex';       
        const item =
            stack.item;     
        const canvas =
            heldItemSlot.icon;
        const ctx =
            canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );
        const renderer =
            window.MiniFeatherRenderItem;
        if (
            typeof renderer ===
            'function'
        ) {
            renderer(
                ctx,
                0,
                0,
                stack,
                CONFIG.iconSize,
                false
            );
        } else {
            console.warn(
                TAG,
                'Native item renderer is not available'
            );
        }       
        const maxDurability =
            Number(item.maxDurability);     
        const damage =
            Number(stack.itemDamage) || 0;      
        if (
            Number.isFinite(maxDurability) &&
            maxDurability > 0
        ) {
            const remaining =
                Math.max(
                    0,
                    maxDurability - damage
                );      
            const percentage =
                Math.max(
                    0,
                    Math.min(
                        100,
                        remaining /
                        maxDurability *
                        100
                    )
                );      
            heldItemSlot.durabilityTrack.style.display =
                'block';        
            heldItemSlot.durabilityFill.style.width =
                `${percentage}%`;       
            heldItemSlot.percentage.style.display =
                'block';        
            heldItemSlot.percentage.textContent =
                `${Math.round(percentage)}%`;
        } else {
            heldItemSlot.durabilityTrack.style.display =
                'none';     
            heldItemSlot.percentage.style.display =
                'none';
        }
    }       
   // CREATE HUD
   function createHUD() {       
       if (root) {
           return;
       }       
       root =
           document.createElement('div');       
       root.id =
           'minifeather-armor-hud';            
       Object.assign(
           root.style,
           {
               position: 'fixed',       
               right:
                   `${CONFIG.right}px`,       
               bottom:
                   `${CONFIG.bottom}px`,       
               display: 'flex',       
               flexDirection: 'column',       
               alignItems: 'center',       
               gap:
                   `${CONFIG.gap}px`,       
               padding: '0',       
               margin: '0',       
               background:
                   'transparent',       
               border: 'none',       
               boxShadow: 'none',       
               backdropFilter:
                   'none',       
               zIndex:
                   '999999',       
               pointerEvents:
                   'none',       
               userSelect:
                   'none'
           }
       );       
       document.body.appendChild(root);           
       for (let i = 0; i < 4; i++) {       
           slots.push(
               createSlot(i)
           );
       }
       heldItemSlot = createHeldItemSlot();
       applyPositions();
   }           
   function updateSlot(slot, stack) {
        const slotIndex =
            slots.indexOf(slot);    
        if (!stack?.item) { 
            slot.root.style.opacity = '0.65';   
            const emptyTexture =
                `empty_armor_slot_${SLOT_NAMES[slotIndex]}`;    
            applySprite(
                slot.icon,
                emptyTexture
            );  
            slot.durabilityTrack.style.display =
                'none'; 
            slot.percentage.style.display =
                'none'; 
            return;
        }   
        slot.root.style.opacity = '1';  
        const itemName =
            stack.item.name;    
        if (itemName) { 
            applySprite(
                slot.icon,
                itemName
            );
        }   
        const durability =
            getDurabilityInfo(stack);   
        updateDurabilityDisplay(
            slot,
            durability
        );
    }            
   function getSignature(armor) {       
       return armor.map(stack => {       
           if (!stack) {
               return 'empty';
           }       
           const item =
               stack.item;       
           return [
               item?.name || '',
               stack.itemDamage || 0,
               stack.stackSize || 0,
               item?.maxDurability || 0
           ].join(':');       
       }).join('|');
   }          
   function update() {     
    if (!enabled) {
        if (root) {
            root.style.display = 'none';
        }      
        return;
    }      
    if (!root) {
        createHUD();
    }       
       const armor =
           getArmor();       
       if (!armor || !inGame()) {       
           if (root) {       
               root.style.display =
                   'none';
           }       
           return;
       }       
       root.style.display =
           'flex';             
       const signature =
           getSignature(armor);       
       if (
           signature === lastSignature
       ) {
           return;
       }       
       lastSignature =
           signature;       
       for (let i = 0; i < 4; i++) {       
           updateSlot(
               slots[i],
               armor[i]
           );
       }
       updateHeldItem();
   }         
   function start() {       
       console.log(
           TAG,
           'Starting...'
       );             
       const timer =
           setInterval(() => {       
               try {       
                   update();       
               } catch (error) {       
                   console.error(
                       TAG,
                       error
                   );
               }       
           }, CONFIG.updateInterval);       
       window.MiniFeatherArmorHUD = {       
           destroy() {       
               clearInterval(
                   timer
               );
               document.removeEventListener(
                   'minifeather:armorhud-config',
                   handleConfig
               );
               document.removeEventListener(
                    'minifeather:armorhud-layout',
                    handleLayout
                );       
               root?.remove();       
               root = null;
               slots = [];       
               console.log(
                   TAG,
                   'Destroyed'
               );
           },       
           update
       };       
       console.log(
           TAG,
           '✓ Armor HUD initialized'
       );
   }            
   if (
       document.readyState ===
       'loading'
   ) {       
       document.addEventListener(
           'DOMContentLoaded',
           start,
           { once: true }
       );       
   } else {       
       start();       
   }
})();