(function () {
    'use strict';

    const TAG = '[MiniFeather WorldMap]';

    if (window.__MF_WORLD_MAP__) return;
    window.__MF_WORLD_MAP__ = true;

    const CONFIG = {
        toggleKey: 'KeyU',
        heightColors: [
            '#1a3a5c', '#2a5a8c', '#3a7acc', '#c2b280',
            '#5a8f3a', '#3a7a2a', '#6b5a3a', '#7d7d7d',
            '#9d9d9d', '#f0f0f0'
        ],
        blockPixelSize: 4,
        liveScanRadius: 12,
        mapCanvasSize: 1024,
        maxCachedServers: 5,
        maxChunksPerServer: 500
    };

    const BLOCK_NAME_COLORS = {
        // ── Air / special ──
        air: null, barrier: null, aether_portal: null, hell_portal: null, structure_void: null,

        // ── Grass / plants / foliage ──
        grass_block: '#5a8f3a', grass: '#5a8f3a', fern: '#4a7f2a', tall_grass: '#5a8f3a',
        large_fern: '#4a7f2a', dead_bush: '#6b5a2a', vine: '#3a6a1a', cactus: '#3a7a2a',
        sugar_cane: '#5a8a3a', bamboo: '#5a8a2a', kelp: '#3a6a3a', kelp_plant: '#3a6a3a',
        seagrass: '#3a6a4a', tall_seagrass: '#3a6a4a', sea_pickle: '#5a8a3a',

        // ── Saplings ──
        oak_sapling: '#5a8a3a', spruce_sapling: '#4a7a2a', birch_sapling: '#6a9a3a',
        jungle_sapling: '#5a7a2a', acacia_sapling: '#7a8a3a', dark_oak_sapling: '#4a6a2a',

        // ── Flowers ──
        dandelion: '#e0e020', poppy: '#e03020', blue_orchid: '#3080e0', allium: '#a040c0',
        azure_bluet: '#80a0c0', red_tulip: '#c04030', orange_tulip: '#e07020',
        white_tulip: '#e0e0d0', pink_tulip: '#e090a0', oxeye_daisy: '#d0d0a0',
        cornflower: '#3060e0', lily_of_the_valley: '#d0e0d0', wither_rose: '#3a3a3a',
        sunflower: '#e0c020', lilac: '#a060c0', rose_bush: '#b04030', peony: '#e070a0',

        // ── Lily / misc plants ──
        lily_pad: '#3a7a3a',

        // ── Dirt / earth ──
        dirt: '#8b5a2b', coarse_dirt: '#7a4f25', podzol: '#6b5a2a', dirt_path: '#9a7a3a',
        farmland: '#6b4a2a', muck: '#4a3a2a', mycelium: '#5a4a5a',

        // ── Stone variants ──
        stone: '#7d7d7d', cobblestone: '#6a6a6a', granite: '#8a6a5a', diorite: '#a0a0a0',
        andesite: '#6a6a6a', polished_granite: '#9a7a6a', polished_diorite: '#b0b0b0',
        polished_andesite: '#7a7a7a', bedrock: '#3a3a3a', basalt: '#3a3a3a',
        polished_basalt: '#404040', smooth_basalt: '#3a3a3a', infested_stone: '#7d7d7d',
        smooth_stone: '#7a7a7a', stone_bricks: '#6a6a6a', mossy_stone_bricks: '#5a6a4a',
        cracked_stone_bricks: '#6a6a6a', chiseled_stone_bricks: '#6a6a6a',
        smooth_stone_slab: '#7a7a7a', stone_slab: '#7a7a7a',

        // ── Slabs / stairs / walls / fences (stone) ──
        cobblestone_slab: '#6a6a6a', cobblestone_stairs: '#6a6a6a', cobblestone_wall: '#6a6a6a',
        stone_brick_slab: '#6a6a6a', stone_brick_stairs: '#6a6a6a', stone_brick_wall: '#6a6a6a',
        mossy_cobblestone_slab: '#5a6a4a', mossy_cobblestone_stairs: '#5a6a4a', mossy_cobblestone_wall: '#5a6a4a',
        mossy_stone_brick_slab: '#5a6a4a', mossy_stone_brick_stairs: '#5a6a4a', mossy_stone_brick_wall: '#5a6a4a',
        granite_slab: '#8a6a5a', granite_stairs: '#8a6a5a', granite_wall: '#8a6a5a',
        diorite_slab: '#a0a0a0', diorite_stairs: '#a0a0a0', diorite_wall: '#a0a0a0',
        andesite_slab: '#6a6a6a', andesite_stairs: '#6a6a6a', andesite_wall: '#6a6a6a',
        polished_granite_slab: '#9a7a6a', polished_granite_stairs: '#9a7a6a',
        polished_diorite_slab: '#b0b0b0', polished_diorite_stairs: '#b0b0b0',
        polished_andesite_slab: '#7a7a7a', polished_andesite_stairs: '#7a7a7a',
        sandstone_slab: '#e0d090', sandstone_stairs: '#e0d090', sandstone_wall: '#e0d090',
        red_sandstone_slab: '#c08050', red_sandstone_stairs: '#c08050', red_sandstone_wall: '#c08050',
        smooth_sandstone_slab: '#e8d8a0', smooth_sandstone_stairs: '#e8d8a0',
        smooth_red_sandstone_slab: '#c88860', smooth_red_sandstone_stairs: '#c88860',
        brick_slab: '#8a4a3a', brick_stairs: '#8a4a3a', brick_wall: '#8a4a3a',
        end_stone_brick_slab: '#c0b880', end_stone_brick_stairs: '#c0b880', end_stone_brick_wall: '#c0b880',
        stone_button: '#7a7a7a', stone_pressure_plate: '#7a7a7a',

        // ── Sand / sandstone ──
        sand: '#e6d8a0', red_sand: '#c68850', sandstone: '#e0d090', red_sandstone: '#c08050',
        smooth_sandstone: '#e8d8a0', chiseled_sandstone: '#dfd090', cut_sandstone: '#e0d090',
        smooth_red_sandstone: '#c88860', chiseled_red_sandstone: '#c08050', cut_red_sandstone: '#c08050',
        cut_sandstone_slab: '#e0d090', cut_red_sandstone_slab: '#c08050',

        // ── Gravel / clay ──
        gravel: '#7a6a5a', clay: '#9a9ab0',

        // ── Liquids / ice / snow ──
        water: '#3a6fcd', lava: '#e86010', water_cauldron: '#3a6fcd',
        ice: '#90c0e8', packed_ice: '#80b0d8', blue_ice: '#5090d8', frosted_ice: '#90c0e8',
        snow: '#f0f0f0', snow_block: '#f0f0f0',

        // ── Ores ──
        coal_ore: '#5a5a5a', iron_ore: '#8a7a6a', gold_ore: '#b0a050',
        diamond_ore: '#5aaab0', emerald_ore: '#3aaa50', lapis_ore: '#3a4aaa',
        redstone_ore: '#8a2a2a', hell_marble_ore: '#6a3a3a', infernium_ore: '#aa3a2a',
        hell_gold_ore: '#b0a050', nether_gold_ore: '#b0a050',
        gilded_blackstone: '#2a2a2a',

        // ── Ore blocks ──
        coal_block: '#3a3a3a', iron_block: '#c0c0c0', gold_block: '#e0c040',
        diamond_block: '#5ae0e0', emerald_block: '#3ae060', lapis_block: '#3a4acc',
        redstone_block: '#a02020', infernium_block: '#c03020',

        // ── Wood — logs ──
        oak_log: '#6b4f2a', spruce_log: '#5a3f22', birch_log: '#c4a87a', jungle_log: '#5a4020',
        acacia_log: '#8a4a20', dark_oak_log: '#3a2a18',
        stripped_oak_log: '#9a7a4a', stripped_spruce_log: '#8a6a3a', stripped_birch_log: '#d0c090',
        stripped_jungle_log: '#8a6a3a', stripped_acacia_log: '#a0703a', stripped_dark_oak_log: '#6a4a2a',
        mushroom_stem: '#8a8a7a',

        // ── Wood — planks ──
        oak_planks: '#a67a4a', spruce_planks: '#8a6a3a', birch_planks: '#c4a87a',
        jungle_planks: '#9a7a3a', acacia_planks: '#b07a3a', dark_oak_planks: '#5a4028',
        crimson_planks: '#602030', warped_planks: '#205060',

        // ── Wood — wood blocks ──
        oak_wood: '#6b4f2a', spruce_wood: '#5a3f22', birch_wood: '#c4a87a',
        jungle_wood: '#5a4020', acacia_wood: '#8a4a20', dark_oak_wood: '#3a2a18',
        stripped_oak_wood: '#9a7a4a', stripped_spruce_wood: '#8a6a3a', stripped_birch_wood: '#d0c090',
        stripped_jungle_wood: '#8a6a3a', stripped_acacia_wood: '#a0703a', stripped_dark_oak_wood: '#6a4a2a',
        stripped_crimson_stem: '#702030', stripped_warped_stem: '#205070',
        stripped_crimson_hyphae: '#702030', stripped_warped_hyphae: '#205070',
        crimson_stem: '#602030', warped_stem: '#205060',
        crimson_hyphae: '#602030', warped_hyphae: '#205060',

        // ── Wood — slabs / stairs ──
        oak_slab: '#a67a4a', oak_stairs: '#a67a4a',
        spruce_slab: '#8a6a3a', spruce_stairs: '#8a6a3a',
        birch_slab: '#c4a87a', birch_stairs: '#c4a87a',
        jungle_slab: '#9a7a3a', jungle_stairs: '#9a7a3a',
        acacia_slab: '#b07a3a', acacia_stairs: '#b07a3a',
        dark_oak_slab: '#5a4028', dark_oak_stairs: '#5a4028',
        crimson_slab: '#602030', crimson_stairs: '#602030',
        warped_slab: '#205060', warped_stairs: '#205060',
        purpur_slab: '#8a6080', purpur_stairs: '#8a6080', purpur_pillar: '#8a6080',

        // ── Wood — fences / gates ──
        oak_fence: '#a67a4a', oak_fence_gate: '#a67a4a',
        spruce_fence: '#8a6a3a', spruce_fence_gate: '#8a6a3a',
        birch_fence: '#c4a87a', birch_fence_gate: '#c4a87a',
        jungle_fence: '#9a7a3a', jungle_fence_gate: '#9a7a3a',
        acacia_fence: '#b07a3a', acacia_fence_gate: '#b07a3a',
        dark_oak_fence: '#5a4028', dark_oak_fence_gate: '#5a4028',
        crimson_fence: '#602030', crimson_fence_gate: '#602030',
        warped_fence: '#205060', warped_fence_gate: '#205060',
        hell_brick_fence: '#4a2010',

        // ── Wood — doors / trapdoors / buttons / plates / signs ──
        oak_door: '#a67a4a', oak_trapdoor: '#6b4f2a', oak_button: '#a67a4a', oak_pressure_plate: '#a67a4a',
        oak_sign: '#a67a4a', oak_wall_sign: '#a67a4a',
        spruce_door: '#8a6a3a', spruce_trapdoor: '#5a3f22', spruce_button: '#8a6a3a', spruce_pressure_plate: '#8a6a3a',
        spruce_sign: '#8a6a3a', spruce_wall_sign: '#8a6a3a',
        birch_door: '#c4a87a', birch_trapdoor: '#a08050', birch_button: '#c4a87a', birch_pressure_plate: '#c4a87a',
        birch_sign: '#c4a87a', birch_wall_sign: '#c4a87a',
        jungle_door: '#9a7a3a', jungle_trapdoor: '#5a4020', jungle_button: '#9a7a3a', jungle_pressure_plate: '#9a7a3a',
        jungle_sign: '#9a7a3a', jungle_wall_sign: '#9a7a3a',
        acacia_door: '#b07a3a', acacia_trapdoor: '#8a4a20', acacia_button: '#b07a3a', acacia_pressure_plate: '#b07a3a',
        acacia_sign: '#b07a3a', acacia_wall_sign: '#b07a3a',
        dark_oak_door: '#5a4028', dark_oak_trapdoor: '#3a2a18', dark_oak_button: '#5a4028', dark_oak_pressure_plate: '#5a4028',
        dark_oak_sign: '#5a4028', dark_oak_wall_sign: '#5a4028',
        crimson_door: '#602030', crimson_trapdoor: '#602030', crimson_button: '#602030', crimson_pressure_plate: '#602030',
        crimson_sign: '#602030', crimson_wall_sign: '#602030',
        warped_door: '#205060', warped_trapdoor: '#205060', warped_button: '#205060', warped_pressure_plate: '#205060',
        warped_sign: '#205060', warped_wall_sign: '#205060',
        iron_door: '#9a9a9a', iron_trapdoor: '#8a8a8a',

        // ── Leaves ──
        oak_leaves: '#3a7a2a', spruce_leaves: '#2a5a2a', birch_leaves: '#4a8a3a',
        jungle_leaves: '#3a6a2a', acacia_leaves: '#5a7a2a', dark_oak_leaves: '#2a4a1a',
        warped_wart_block: '#205050', warped_roots: '#306070', crimson_roots: '#702030',
        shroomlight: '#d09030',

        // ── Glass ──
        glass: '#c0e0f0', glass_pane: '#c0e0f0',
        white_stained_glass: '#e0e0e0', orange_stained_glass: '#e08030', magenta_stained_glass: '#c040a0',
        light_blue_stained_glass: '#40a0e0', yellow_stained_glass: '#e0e030', lime_stained_glass: '#60e030',
        pink_stained_glass: '#e090b0', gray_stained_glass: '#404040', light_gray_stained_glass: '#808080',
        cyan_stained_glass: '#208080', purple_stained_glass: '#602080', blue_stained_glass: '#2020a0',
        brown_stained_glass: '#403020', green_stained_glass: '#208020', red_stained_glass: '#c02020', black_stained_glass: '#101010',
        white_stained_glass_pane: '#e0e0e0', orange_stained_glass_pane: '#e08030', magenta_stained_glass_pane: '#c040a0',
        light_blue_stained_glass_pane: '#40a0e0', yellow_stained_glass_pane: '#e0e030', lime_stained_glass_pane: '#60e030',
        pink_stained_glass_pane: '#e090b0', gray_stained_glass_pane: '#404040', light_gray_stained_glass_pane: '#808080',
        cyan_stained_glass_pane: '#208080', purple_stained_glass_pane: '#602080', blue_stained_glass_pane: '#2020a0',
        brown_stained_glass_pane: '#403020', green_stained_glass_pane: '#208020', red_stained_glass_pane: '#c02020', black_stained_glass_pane: '#101010',

        // ── Wool ──
        white_wool: '#e0e0e0', orange_wool: '#e08030', magenta_wool: '#c040a0',
        light_blue_wool: '#40a0e0', yellow_wool: '#e0e030', lime_wool: '#60e030',
        pink_wool: '#e090b0', gray_wool: '#404040', light_gray_wool: '#808080',
        cyan_wool: '#208080', purple_wool: '#602080', blue_wool: '#2020a0',
        brown_wool: '#403020', green_wool: '#208020', red_wool: '#c02020', black_wool: '#101010',
        white_carpet: '#e0e0e0', orange_carpet: '#e08030', magenta_carpet: '#c040a0',
        light_blue_carpet: '#40a0e0', yellow_carpet: '#e0e030', lime_carpet: '#60e030',
        pink_carpet: '#e090b0', gray_carpet: '#404040', light_gray_carpet: '#808080',
        cyan_carpet: '#208080', purple_carpet: '#602080', blue_carpet: '#2020a0',
        brown_carpet: '#403020', green_carpet: '#208020', red_carpet: '#c02020', black_carpet: '#101010',

        // ── Concrete / concrete powder ──
        white_concrete: '#d0d0d0', orange_concrete: '#d07020', magenta_concrete: '#b03090',
        light_blue_concrete: '#3090d0', yellow_concrete: '#d0d020', lime_concrete: '#50d020',
        pink_concrete: '#d080a0', gray_concrete: '#303030', light_gray_concrete: '#707070',
        cyan_concrete: '#107070', purple_concrete: '#501070', blue_concrete: '#101090',
        brown_concrete: '#302010', green_concrete: '#107010', red_concrete: '#a01010', black_concrete: '#080808',
        white_concrete_powder: '#d0d0d0', orange_concrete_powder: '#d07020', magenta_concrete_powder: '#b03090',
        light_blue_concrete_powder: '#3090d0', yellow_concrete_powder: '#d0d020', lime_concrete_powder: '#50d020',
        pink_concrete_powder: '#d080a0', gray_concrete_powder: '#303030', light_gray_concrete_powder: '#707070',
        cyan_concrete_powder: '#107070', purple_concrete_powder: '#501070', blue_concrete_powder: '#101090',
        brown_concrete_powder: '#302010', green_concrete_powder: '#107010', red_concrete_powder: '#a01010', black_concrete_powder: '#080808',

        // ── Terracotta / glazed ──
        terracotta: '#8a5a4a',
        white_terracotta: '#a09080', orange_terracotta: '#9a6030', magenta_terracotta: '#9a5070',
        light_blue_terracotta: '#708090', yellow_terracotta: '#a08030', lime_terracotta: '#608040',
        pink_terracotta: '#9a7060', gray_terracotta: '#404040', light_gray_terracotta: '#807070',
        cyan_terracotta: '#507070', purple_terracotta: '#604060', blue_terracotta: '#404060',
        brown_terracotta: '#503530', green_terracotta: '#506040', red_terracotta: '#804030', black_terracotta: '#202020',
        white_glazed_terracotta: '#e0e0e0', orange_glazed_terracotta: '#e08030', magenta_glazed_terracotta: '#c040a0',
        light_blue_glazed_terracotta: '#40a0e0', yellow_glazed_terracotta: '#e0e030', lime_glazed_terracotta: '#60e030',
        pink_glazed_terracotta: '#e090b0', gray_glazed_terracotta: '#404040', light_gray_glazed_terracotta: '#808080',
        cyan_glazed_terracotta: '#208080', purple_glazed_terracotta: '#602080', blue_glazed_terracotta: '#2020a0',
        brown_glazed_terracotta: '#403020', green_glazed_terracotta: '#208020', red_glazed_terracotta: '#c02020', black_glazed_terracotta: '#101010',

        // ── Beds ──
        white_bed: '#e0e0e0', orange_bed: '#e08030', magenta_bed: '#c040a0',
        light_blue_bed: '#40a0e0', yellow_bed: '#e0e030', lime_bed: '#60e030',
        pink_bed: '#e090b0', gray_bed: '#404040', light_gray_bed: '#808080',
        cyan_bed: '#208080', purple_bed: '#602080', blue_bed: '#2020a0',
        brown_bed: '#403020', green_bed: '#208020', red_bed: '#c02020', black_bed: '#101010',

        // ── Nether / Hell blocks ──
        hellstone: '#6a2010', soul_sand: '#3a2a1a', glowstone: '#c0a040',
        hell_bricks: '#4a2010', hell_fungus_block: '#5a2a1a', red_hell_bricks: '#6a2020',
        hell_brick_slab: '#4a2010', hell_brick_stairs: '#4a2010', hell_brick_wall: '#4a2010',
        red_hell_brick_slab: '#6a2020', red_hell_brick_stairs: '#6a2020', red_hell_brick_wall: '#6a2020',
        cracked_hell_bricks: '#4a2010', chiseled_hell_bricks: '#4a2010',
        magma_block: '#5a2010', soul_soil: '#3a2a1a', soul_fire: '#40e0a0',
        hell_sprouts: '#5a2a1a', hell_fungus: '#703020', crimson_fungus: '#703020',
        crimson_nylium: '#602030', warped_nylium: '#205060', warped_fungus: '#205060',
        hell_wart: '#602030', nether_wart: '#602030', bone_block: '#c8b890',
        lodestone: '#4a3a3a', crying_obsidian: '#1a0a2a', respawn_anchor: '#4a1a3a',

        // ── End blocks ──
        end_stone: '#c0b880', end_stone_bricks: '#c0b880',
        purpur_block: '#8a6080', end_portal_frame: '#303030', end_rod: '#f0f0d0',

        // ── Marble / Aquastone ──
        marble_block: '#d0d0c0', marble_pillar: '#d0d0c0', marble_bricks: '#d0d0c0',
        smooth_marble: '#d8d8c8', smooth_marble_slab: '#d8d8c8', smooth_marble_stairs: '#d8d8c8',
        marble_slab: '#d0d0c0', marble_stairs: '#d0d0c0', chiseled_marble_block: '#c8c8b8',
        aquastone: '#3080a0', aquastone_bricks: '#3080a0', dark_aquastone: '#205080',
        aquastone_slab: '#3080a0', aquastone_stairs: '#3080a0', aquastone_wall: '#3080a0',
        aquastone_brick_slab: '#3080a0', aquastone_brick_stairs: '#3080a0',
        dark_aquastone_slab: '#205080', dark_aquastone_stairs: '#205080',

        // ── Obsidian ──
        obsidian: '#1a0a1a',

        // ── Utility blocks ──
        crafting_table: '#8a6a3a', workbench: '#8a6a3a', enchanting_table: '#5a3030',
        furnace: '#5a5a5a', blast_furnace: '#5a5a5a', smoker: '#4a4a4a',
        brewing_stand: '#6a5a4a', cauldron: '#5a5a5a', anvil: '#4a4a4a',
        chipped_anvil: '#4a4a4a', damaged_anvil: '#4a4a4a',
        beacon: '#60e0e0', conduit: '#3080a0', hopper: '#3a3a3a',
        dispenser: '#6a5a4a', dropper: '#6a5a4a', observer: '#5a4a3a',
        piston: '#8a7a5a', sticky_piston: '#7a8a5a', piston_head: '#8a7a5a', moving_piston: '#8a7a5a',
        note_block: '#8a6a3a', jukebox: '#6a4a2a', cake: '#e0c0a0',
        tnt: '#c03020', slime_block: '#50c050', honey_block: '#d0a030', honeycomb_block: '#d0a030',
        bookshelf: '#8a6a3a', barrel: '#8a6a4a', chest: '#8a6a3a', ender_chest: '#2a2a3a',
        shulker_box: '#8a4a4a', scaffolding: '#a08050', loom: '#8a6a3a',
        cartography_table: '#8a6a3a', fletching_table: '#8a6a3a', smithing_table: '#4a4a4a',
        grindstone: '#4a4a4a', stonecutter: '#5a5a5a', bell: '#d0a030',
        lantern: '#504030', soul_lantern: '#405040', campfire: '#6a4a2a', soul_campfire: '#405040',
        lectern: '#8a6a3a', compost: '#5a4a3a',

        // ── Redstone ──
        redstone_wire: '#8a2a2a', redstone_torch: '#a02020', redstone_wall_torch: '#a02020',
        redstone_lamp: '#8a6a3a', repeater: '#8a8a3a', comparator: '#8a8a3a',
        lever: '#6a5a3a', rail: '#6a6a6a', powered_rail: '#b08030', detector_rail: '#6a6a6a',
        activator_rail: '#8a6a3a',
        heavy_weighted_pressure_plate: '#5a5a5a', light_weighted_pressure_plate: '#d0a030',
        iron_bars: '#9a9a9a', iron_block: '#c0c0c0',

        // ── Command blocks ──
        command_block: '#9080a0', chain_command_block: '#9070a0', repeating_command_block: '#9060a0',
        structure_block: '#5a5a5a', jigsaw: '#5a5a5a',

        // ── Fire / torches ──
        fire: '#e04010', torch: '#c08030', wall_torch: '#c08030',
        soul_torch: '#40a070', soul_wall_torch: '#40a070', redstone_torch: '#a02020',
        end_portal: '#0a0a0a', end_gateway: '#0a0a0a', nether_portal: '#4a0a4a',

        // ── Mushrooms ──
        red_mushroom: '#c0302a', brown_mushroom: '#8a6a4a',
        red_mushroom_block: '#8a3020', brown_mushroom_block: '#6a5a3a', stem_mushroom_block: '#8a8a7a',
        nether_wart_block: '#602030',

        // ── Crops / food ──
        wheat: '#a09030', beetroots: '#8a2040', carrots: '#e08030', potatoes: '#a0a040',
        pumpkin_stem: '#5a8a3a', melon_stem: '#5a8a3a',
        attached_pumpkin_stem: '#7a8a3a', attached_melon_stem: '#7a8a3a',
        pumpkin: '#c08020', carved_pumpkin: '#c08020', jack_o_lantern: '#c08020',
        melon: '#3a8a3a', hay_block: '#c0a030', cocoa: '#8a5a3a',
        sweet_berry_bush: '#3a7a2a', nether_wart: '#602030',

        // ── Organic / misc ──
        sponge: '#d0c050', wet_sponge: '#c0a040', cobweb: '#b0b0b0',
        ladder: '#8a6a3a', iron_ladder: '#9a9a9a',
        bamboo_sapling: '#5a8a2a', kelp_plant: '#3a6a3a', dried_kelp_block: '#3a5a2a',
        target: '#e0e030', sea_lantern: '#a0e0e0', sea_pickle: '#5a8a3a',
        turtle_egg: '#d0c0a0', conduit_frame: '#3080a0', coral_block: '#e06060',
        dead_coral_block: '#8a8a8a',

        // ── Dragon / special ──
        dragon_egg: '#1a0a1a', spawner: '#3a3a3a', infested_stone: '#7d7d7d',

        // ── Backpacks (custom) ──
        backpack: '#8a5a3a', diamond_backpack: '#5ae0e0', gold_backpack: '#e0c040',
        iron_backpack: '#c0c0c0', infernium_backpack: '#c03020',

        // ── Cloud / meteorite ──
        cloud_block: '#f0f0f0', meteorite_block: '#3a3a4a',

        // ── Blackstone variants ──
        blackstone: '#2a2a2a', polished_blackstone: '#3a3a3a', polished_blackstone_bricks: '#333333',
        polished_blackstone_button: '#3a3a3a', polished_blackstone_pressure_plate: '#3a3a3a',
        polished_blackstone_slab: '#3a3a3a', polished_blackstone_stairs: '#3a3a3a', polished_blackstone_wall: '#3a3a3a',
        polished_blackstone_brick_slab: '#333333', polished_blackstone_brick_stairs: '#333333', polished_blackstone_brick_wall: '#333333',
        chiseled_polished_blackstone: '#333333', cracked_polished_blackstone_bricks: '#333333',
        gilded_blackstone: '#2a2a2a',

        // ── Signs (standing) ──
        sign: '#a67a4a', wall_sign: '#a67a4a',

        // ── Player head ──
        player_head: '#d0a080', player_wall_head: '#d0a080',
        skeleton_skull: '#d0d0d0', skeleton_wall_skull: '#d0d0d0',
        zombie_head: '#3a5a3a', zombie_wall_head: '#3a5a3a',
        creeper_head: '#3a5a3a', creeper_wall_head: '#3a5a3a',
        wither_skeleton_skull: '#3a3a3a', wither_skeleton_wall_skull: '#3a3a3a',
        dragon_head: '#3a3a3a', dragon_wall_head: '#3a3a3a',

        // ── Banners ──
        white_banner: '#e0e0e0', orange_banner: '#e08030', magenta_banner: '#c040a0',
        light_blue_banner: '#40a0e0', yellow_banner: '#e0e030', lime_banner: '#60e030',
        pink_banner: '#e090b0', gray_banner: '#404040', light_gray_banner: '#808080',
        cyan_banner: '#208080', purple_banner: '#602080', blue_banner: '#2020a0',
        brown_banner: '#403020', green_banner: '#208020', red_banner: '#c02020', black_banner: '#101010',
        white_wall_banner: '#e0e0e0', orange_wall_banner: '#e08030', magenta_wall_banner: '#c040a0',
        light_blue_wall_banner: '#40a0e0', yellow_wall_banner: '#e0e030', lime_wall_banner: '#60e030',
        pink_wall_banner: '#e090b0', gray_wall_banner: '#404040', light_gray_wall_banner: '#808080',
        cyan_wall_banner: '#208080', purple_wall_banner: '#602080', blue_wall_banner: '#2020a0',
        brown_wall_banner: '#403020', green_wall_banner: '#208020', red_wall_banner: '#c02020', black_wall_banner: '#101010',

        // ── Potted plants ──
        flower_pot: '#8a6a4a',
        potted_oak_sapling: '#5a8a3a', potted_spruce_sapling: '#4a7a2a', potted_birch_sapling: '#6a9a3a',
        potted_jungle_sapling: '#5a7a2a', potted_acacia_sapling: '#7a8a3a', potted_dark_oak_sapling: '#4a6a2a',
        potted_fern: '#4a7f2a', potted_dandelion: '#e0e020', potted_poppy: '#e03020',
        potted_blue_orchid: '#3080e0', potted_allium: '#a040c0', potted_azure_bluet: '#80a0c0',
        potted_red_tulip: '#c04030', potted_orange_tulip: '#e07020', potted_white_tulip: '#e0e0d0',
        potted_pink_tulip: '#e090a0', potted_oxeye_daisy: '#d0d0a0', potted_cornflower: '#3060e0',
        potted_lily_of_the_valley: '#d0e0d0', potted_wither_rose: '#3a3a3a',
        potted_red_mushroom: '#c0302a', potted_brown_mushroom: '#8a6a4a',
        potted_dead_bush: '#6b5a2a', potted_cactus: '#3a7a2a', potted_bamboo: '#5a8a2a',
        potted_crimson_fungus: '#703020', potted_crimson_roots: '#702030',
        potted_warped_fungus: '#205060', potted_warped_roots: '#306070',
    };

    let _blockRegistry = null;
    let _stateIdColorCache = new Map();

    function getBlockRegistry(world) {
        if (_blockRegistry) return _blockRegistry;
        try {
            const worldProto2 = getWorldProto2(world);
            const chunk = worldProto2.getChunkByID.call(world, 0, 0);
            if (!chunk?.cells?.[0]) return null;
            const cell = chunk.cells[0];
            const cellProto = Object.getPrototypeOf(cell);
            const getSrc = cellProto.get.toString();
            const match = getSrc.match(/fromBlockStateId/);
            if (match) {
                const fromFn = cellProto.get.toString().match(/(\w+)\.fromBlockStateId/);
                if (fromFn) {
                    const regName = fromFn[1];
                    _blockRegistry = eval(regName);
                }
            }
        } catch (_) {}
        return _blockRegistry;
    }

    function resolveStateIdToBlockName(world, stateId) {
        if (stateId === 0) return 'air';
        const reg = getBlockRegistry(world);
        if (!reg) return null;
        try {
            const state = reg.fromBlockStateId(stateId);
            return state?.getBlock?.()?.name || null;
        } catch (_) {
            return null;
        }
    }

    function stateIdToColor(world, stateId, fallbackY) {
        if (stateId === 0) return heightToColor(fallbackY);

        if (_stateIdColorCache.has(stateId)) {
            return _stateIdColorCache.get(stateId);
        }

        const name = resolveStateIdToBlockName(world, stateId);
        let color = null;

        if (name) {
            if (BLOCK_NAME_COLORS[name] !== undefined) {
                color = BLOCK_NAME_COLORS[name];
            } else {
                const baseName = name.replace(/_(bricks?|stairs|slab|wall|fence|door)$/, '');
                if (BLOCK_NAME_COLORS[baseName] !== undefined) {
                    color = BLOCK_NAME_COLORS[baseName];
                }
            }
        }

        if (!color) {
            color = heightToColor(fallbackY);
        }

        if (_stateIdColorCache.size < 2000) {
            _stateIdColorCache.set(stateId, color);
        }

        return color;
    }

    const state = {
        open: false,
        overlay: null,
        canvas: null,
        ctx: null,
        coordsLabel: null,
        centerX: 0,
        centerZ: 0,
        zoom: 1,
        lastPlayerChunkX: null,
        lastPlayerChunkZ: null,
        scanInterval: null,
        serverCaches: new Map(),
        currentServerKey: null,
        currentDimensionId: 0
    };

    function getGame() {
        if (window.__mfGame?.player) return window.__mfGame;

        const candidates = [
            document.querySelector('canvas'),
            document.body,
            document.getElementById('canvas-holder'),
            document.getElementById('root')
        ].filter(Boolean);

        for (const el of candidates) {
            const fiberKey = Object.keys(el).find(k =>
                k.startsWith('__reactFiber$') ||
                k.startsWith('__reactInternalInstance$') ||
                k.startsWith('__reactContainer$')
            );
            if (!fiberKey) continue;

            let fiber = el[fiberKey];
            while (fiber) {
                if (fiber.memoizedProps?.game?.player) {
                    window.__mfGame = fiber.memoizedProps.game;
                    return window.__mfGame;
                }
                fiber = fiber.return;
            }
        }

        return null;
    }

    function getWorldProto2(world) {
        let proto = Object.getPrototypeOf(world);
        for (let i = 0; i < 5; i++) {
            if (typeof proto?.isChunkLoaded === 'function' &&
                typeof proto?.getChunkByID === 'function') {
                return proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return Object.getPrototypeOf(Object.getPrototypeOf(world));
    }

    function getServerKey(game) {
        try {
            const si = game.serverInfo;
            if (!si) return 'unknown';
            if (typeof si.serverId === 'string' && si.serverId) return si.serverId;
            const proto = Object.getPrototypeOf(si);
            const desc = Object.getOwnPropertyDescriptor(proto, 'worldCacheKey');
            if (desc?.get) {
                const key = desc.get.call(si);
                if (key) return key;
            }
            const name = si.serverName || si.worldType || 'unknown';
            return String(name);
        } catch (_) {
            return 'unknown';
        }
    }

    function getDimensionId(game) {
        try {
            return game.world?.dimensionId ?? 0;
        } catch (_) {
            return 0;
        }
    }

    function getCurrentCache() {
        if (!state.currentServerKey) return null;
        const serverCache = state.serverCaches.get(state.currentServerKey);
        if (!serverCache) return null;
        return serverCache.get(state.currentDimensionId) || null;
    }

    function getOrCreateCache() {
        let serverCache = state.serverCaches.get(state.currentServerKey);
        if (!serverCache) {
            serverCache = new Map();
            state.serverCaches.set(state.currentServerKey, serverCache);
        }
        let dimCache = serverCache.get(state.currentDimensionId);
        if (!dimCache) {
            dimCache = new Map();
            serverCache.set(state.currentDimensionId, dimCache);
        }
        return dimCache;
    }

    function getChunkHeightMap(world, worldProto2, cx, cz) {
        const chunk = worldProto2.getChunkByID.call(world, cx, cz);
        if (!chunk || !chunk.cells) return null;

        const heights = new Int16Array(256);
        const blockTypes = new Uint16Array(256);

        for (let colX = 0; colX < 16; colX++) {
            for (let colZ = 0; colZ < 16; colZ++) {
                let topY = -1;
                let topStateId = 0;

                for (let cellIdx = chunk.cells.length - 1; cellIdx >= 0; cellIdx--) {
                    const cell = chunk.cells[cellIdx];
                    if (!cell || !cell.bitArray) continue;

                    const yBase = cell.yBase;

                    for (let y = 15; y >= 0; y--) {
                        const realY = yBase + y;
                        if (realY < 0) break;

                        const blockIndex = (y << 8) | (colZ << 4) | colX;
                        const stateIdRaw = cell.bitArray.get(blockIndex);
                        const stateId = cell.palette && cell.palette.length > 0
                            ? cell.palette[stateIdRaw]
                            : stateIdRaw;

                        if (stateId !== 0) {
                            topY = realY;
                            topStateId = stateId;
                            break;
                        }
                    }

                    if (topY !== -1) break;
                }

                const colIndex = colZ * 16 + colX;
                heights[colIndex] = topY;
                blockTypes[colIndex] = topStateId;
            }
        }

        return { heights, blockTypes };
    }

    function heightToColor(y) {
        if (y < 0) return CONFIG.heightColors[0];
        if (y < 12) return CONFIG.heightColors[0];
        if (y < 24) return CONFIG.heightColors[1];
        if (y < 32) return CONFIG.heightColors[2];
        if (y < 40) return CONFIG.heightColors[3];
        if (y < 56) return CONFIG.heightColors[4];
        if (y < 72) return CONFIG.heightColors[5];
        if (y < 88) return CONFIG.heightColors[6];
        if (y < 104) return CONFIG.heightColors[7];
        if (y < 128) return CONFIG.heightColors[8];
        return CONFIG.heightColors[9];
    }

    function scanChunksAroundPlayer() {
        const game = getGame();
        if (!game?.player?.pos) return;

        const world = game.world;
        if (!world) return;

        const newServerKey = getServerKey(game);
        const newDimId = getDimensionId(game);

        if (state.currentServerKey !== newServerKey ||
            state.currentDimensionId !== newDimId) {
            state.currentServerKey = newServerKey;
            state.currentDimensionId = newDimId;
            state.lastPlayerChunkX = null;
            state.lastPlayerChunkZ = null;
            console.log(`${TAG} Server: ${newServerKey} | Dimension: ${newDimId}`);
        }

        const worldProto2 = getWorldProto2(world);
        const px = Math.floor(game.player.pos.x);
        const pz = Math.floor(game.player.pos.z);
        const pcx = px >> 4;
        const pcz = pz >> 4;

        if (state.lastPlayerChunkX === pcx && state.lastPlayerChunkZ === pcz) return;
        state.lastPlayerChunkX = pcx;
        state.lastPlayerChunkZ = pcz;

        const chunkCache = getOrCreateCache();

        let scanned = 0;
        for (let dx = -CONFIG.liveScanRadius; dx <= CONFIG.liveScanRadius; dx++) {
            for (let dz = -CONFIG.liveScanRadius; dz <= CONFIG.liveScanRadius; dz++) {
                const cx = pcx + dx;
                const cz = pcz + dz;
                const cacheKey = cx + ',' + cz;

                if (chunkCache.has(cacheKey)) continue;

                try {
                    if (!worldProto2.isChunkLoaded.call(world, cx, cz)) continue;

                    const data = getChunkHeightMap(world, worldProto2, cx, cz);
                    if (!data) continue;

                    chunkCache.set(cacheKey, {
                        cx, cz,
                        heights: data.heights,
                        blockTypes: data.blockTypes,
                        timestamp: Date.now()
                    });
                    scanned++;
                } catch (_) {}
            }
        }

        if (scanned > 0) {
            console.log(`${TAG} Scanned ${scanned} new chunks. Total: ${chunkCache.size}`);
        }

        if (chunkCache.size > CONFIG.maxChunksPerServer) {
            const entries = Array.from(chunkCache.entries());
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            const trimmed = new Map(entries.slice(0, CONFIG.maxChunksPerServer));
            const serverCache = state.serverCaches.get(state.currentServerKey);
            serverCache.set(state.currentDimensionId, trimmed);
        }
    }

    function renderMap() {
        if (!state.ctx) return;

        const ctx = state.ctx;
        const canvas = state.canvas;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        const blockPx = CONFIG.blockPixelSize * state.zoom;
        const centerX = state.centerX;
        const centerZ = state.centerZ;
        const offsetX = w / 2;
        const offsetY = h / 2;

        const chunkCache = getCurrentCache();
        const game = getGame();
        const world = game?.world;

        if (chunkCache) {
            for (const [, chunk] of chunkCache) {
                const chunkWorldX = chunk.cx * 16;
                const chunkWorldZ = chunk.cz * 16;

                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        const worldX = chunkWorldX + x;
                        const worldZ = chunkWorldZ + z;
                        const colIndex = z * 16 + x;

                        const heightY = chunk.heights[colIndex];
                        if (heightY < 0) continue;

                        const screenX = offsetX + (worldX - centerX) * blockPx;
                        const screenY = offsetY + (worldZ - centerZ) * blockPx;

                        if (screenX < -blockPx || screenX > w ||
                            screenY < -blockPx || screenY > h) continue;

                        const stateId = chunk.blockTypes[colIndex];
                        ctx.fillStyle = world
                            ? stateIdToColor(world, stateId, heightY)
                            : heightToColor(heightY);
                        ctx.fillRect(
                            Math.floor(screenX),
                            Math.floor(screenY),
                            Math.ceil(blockPx),
                            Math.ceil(blockPx)
                        );
                    }
                }
            }
        }

        if (blockPx >= 8) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            const startCX = Math.floor((centerX - offsetX / blockPx) / 16) * 16;
            const startCZ = Math.floor((centerZ - offsetY / blockPx) / 16) * 16;
            const endCX = Math.ceil((centerX + offsetX / blockPx) / 16) * 16;
            const endCZ = Math.ceil((centerZ + offsetY / blockPx) / 16) * 16;

            for (let x = startCX; x <= endCX; x += 16) {
                const sx = offsetX + (x - centerX) * blockPx;
                ctx.beginPath();
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
                ctx.stroke();
            }
            for (let z = startCZ; z <= endCZ; z += 16) {
                const sy = offsetY + (z - centerZ) * blockPx;
                ctx.beginPath();
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
                ctx.stroke();
            }
        }

        if (game?.player?.pos) {
            const ppx = game.player.pos.x;
            const ppz = game.player.pos.z;
            const psx = offsetX + (ppx - centerX) * blockPx;
            const psy = offsetY + (ppz - centerZ) * blockPx;

            const yaw = Number(game.player.yaw) || 0;
            ctx.save();
            ctx.translate(psx, psy);
            ctx.rotate(-yaw);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(-5, 5);
            ctx.lineTo(0, 2);
            ctx.lineTo(5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        drawWaypoints(ctx, offsetX, offsetY, centerX, centerZ, blockPx);

        if (state.coordsLabel && game?.player?.pos) {
            const chunkCount = getCurrentCache()?.size || 0;
            state.coordsLabel.textContent =
                `XYZ: ${Math.floor(game.player.pos.x)} / ${Math.floor(game.player.pos.y)} / ${Math.floor(game.player.pos.z)} | ` +
                `Chunks: ${chunkCount} | Zoom: ${state.zoom.toFixed(1)}x | ` +
                `Server: ${state.currentServerKey || '?'} | Dim: ${state.currentDimensionId}`;
        }
    }

    function drawWaypoints(ctx, offsetX, offsetY, centerX, centerZ, blockPx) {
        try {
            const stored = localStorage.getItem('minifeather_waypoints_v1');
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (!parsed?.list) return;

            for (const wp of parsed.list) {
                const sx = offsetX + (wp.x - centerX) * blockPx;
                const sy = offsetY + (wp.z - centerZ) * blockPx;
                if (sx < -20 || sx > state.canvas.width + 20 ||
                    sy < -20 || sy > state.canvas.height + 20) continue;

                ctx.fillStyle = wp.color || '#ff5f5f';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                if (blockPx >= 4) {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    ctx.font = '11px Arial';
                    ctx.textAlign = 'center';
                    ctx.strokeText(wp.name, sx, sy - 10);
                    ctx.fillText(wp.name, sx, sy - 10);
                }
            }
        } catch (_) {}
    }

    function createOverlay() {
        if (state.overlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'mf-worldmap-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)',
            zIndex: '2147483647',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Arial, sans-serif', color: '#ffffff',
            pointerEvents: 'auto'
        });

        const titleBar = document.createElement('div');
        Object.assign(titleBar.style, {
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            width: '90vw', maxWidth: '1200px', marginBottom: '8px'
        });

        const title = document.createElement('span');
        title.textContent = 'World Map';
        Object.assign(title.style, { fontSize: '20px', fontWeight: 'bold' });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close (U)';
        Object.assign(closeBtn.style, {
            background: '#333', color: '#fff',
            border: '1px solid #555', borderRadius: '6px',
            padding: '6px 16px', cursor: 'pointer', fontSize: '14px'
        });
        closeBtn.addEventListener('click', closeMap);

        titleBar.appendChild(title);
        titleBar.appendChild(closeBtn);
        overlay.appendChild(titleBar);

        const canvasContainer = document.createElement('div');
        Object.assign(canvasContainer.style, {
            position: 'relative', border: '2px solid #444',
            borderRadius: '8px', overflow: 'hidden', background: '#0a0a0a'
        });

        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.mapCanvasSize;
        canvas.height = CONFIG.mapCanvasSize;
        Object.assign(canvas.style, {
            display: 'block', maxWidth: '90vw', maxHeight: '75vh', cursor: 'grab'
        });

        canvasContainer.appendChild(canvas);
        overlay.appendChild(canvasContainer);

        const coordsLabel = document.createElement('div');
        Object.assign(coordsLabel.style, {
            marginTop: '8px', fontSize: '13px', opacity: '0.8', fontFamily: 'monospace'
        });
        coordsLabel.textContent = 'Loading...';
        overlay.appendChild(coordsLabel);

        const hint = document.createElement('div');
        Object.assign(hint.style, { marginTop: '4px', fontSize: '11px', opacity: '0.5' });
        hint.innerHTML = 'Drag to pan | Scroll to zoom | U to close';
        overlay.appendChild(hint);

        document.body.appendChild(overlay);

        state.overlay = overlay;
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.coordsLabel = coordsLabel;

        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            const blockPx = CONFIG.blockPixelSize * state.zoom;
            const canvasRect = canvas.getBoundingClientRect();
            const scale = canvas.width / canvasRect.width;
            state.centerX -= (dx * scale) / blockPx;
            state.centerZ -= (dy * scale) / blockPx;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            state.zoom = Math.max(0.5, Math.min(8, state.zoom * delta));
        }, { passive: false });
    }

    function openMap() {
        if (state.open) return;

        const game = getGame();
        if (!game?.player?.pos) {
            console.warn(`${TAG} No game/player found. Make sure you are in-game.`);
            return;
        }

        state.centerX = Math.floor(game.player.pos.x);
        state.centerZ = Math.floor(game.player.pos.z);
        state.zoom = 1;
        state.open = true;

        createOverlay();
        scanChunksAroundPlayer();

        const renderLoop = () => {
            if (!state.open) return;
            scanChunksAroundPlayer();
            renderMap();
            requestAnimationFrame(renderLoop);
        };
        renderLoop();

        const chunkCount = getCurrentCache()?.size || 0;
        console.log(`${TAG} Opened. Server: ${state.currentServerKey} | Chunks: ${chunkCount}`);
    }

    function closeMap() {
        if (!state.open) return;
        state.open = false;
        if (state.overlay) {
            state.overlay.remove();
            state.overlay = null;
            state.canvas = null;
            state.ctx = null;
            state.coordsLabel = null;
        }
    }

    function toggleMap() {
        if (state.open) closeMap();
        else openMap();
    }

    document.addEventListener('keydown', (e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

        if (e.code === CONFIG.toggleKey && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            toggleMap();
        }

        if (e.code === 'Escape' && state.open) {
            e.preventDefault();
            closeMap();
        }
    }, true);

    function startBackgroundScan() {
        if (state.scanInterval) clearInterval(state.scanInterval);
        state.scanInterval = setInterval(() => {
            if (state.open) return;
            scanChunksAroundPlayer();
        }, 3000);
    }

    window.MF_WORLD_MAP = {
        open: openMap,
        close: closeMap,
        toggle: toggleMap,
        get isOpen() { return state.open; },
        get chunkCount() { return getCurrentCache()?.size || 0; },
        get serverKey() { return state.currentServerKey; },
        get dimensionId() { return state.currentDimensionId; },
        clearCache() {
            const cache = getCurrentCache();
            if (cache) cache.clear();
            console.log(`${TAG} Cache cleared for ${state.currentServerKey}/${state.currentDimensionId}`);
        },
        clearAllCaches() {
            state.serverCaches.clear();
            console.log(`${TAG} All caches cleared.`);
        },
        setZoom(z) {
            state.zoom = Math.max(0.5, Math.min(8, Number(z) || 1));
            return state.zoom;
        },
        centerOnPlayer() {
            const game = getGame();
            if (game?.player?.pos) {
                state.centerX = Math.floor(game.player.pos.x);
                state.centerZ = Math.floor(game.player.pos.z);
            }
        }
    };

    console.log(`${TAG} Loaded. Press U to open.`);
    startBackgroundScan();
})();
