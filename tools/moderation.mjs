#!/usr/bin/env node
// chichote de moderación: editar moderation.json sin pelearte con el JSON.
//   node tools/moderation.mjs show
//   node tools/moderation.mjs kill on --reason "mantenimiento" [--screen bsod]
//   node tools/moderation.mjs kill off
//   node tools/moderation.mjs ban <uuid|name> [--reason "..."] [--uuid <uuid>] [--name <name>]
//   node tools/moderation.mjs unban <uuid|name>
//   node tools/moderation.mjs brick <uuid|name> [--reason "..."] [--wipe]  <- pantalla azul total
//   node tools/moderation.mjs unbrick <uuid|name>
//   node tools/moderation.mjs block src/Render/TaczGuns.js [--reason "..."]
//   node tools/moderation.mjs unblock src/Render/TaczGuns.js
// después: commit + push. los clientes traen la config solos (boot + cada
// 5 min) y obedecen sin reinstall: kill switch y bans/bricks en caliente,
// bloqueo de módulos en el próximo arranque (el client se recarga solo).
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'moderation.json');
const MIRROR = path.join(ROOT, 'mirror.json');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function die(msg) {
  console.error('[moderation] ' + msg);
  process.exit(1);
}

function load() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    die('moderation.json no parsea: ' + e.message);
  }
  if (raw.v !== 1) die('moderation.json: v inesperada (' + raw.v + ')');
  if (!raw.killSwitch || typeof raw.killSwitch !== 'object') raw.killSwitch = { active: false, reason: '', since: '', screen: 'overlay' };
  if (!Array.isArray(raw.bannedAccounts)) raw.bannedAccounts = [];
  if (!Array.isArray(raw.brickedAccounts)) raw.brickedAccounts = [];
  if (!raw.blockedModules || typeof raw.blockedModules !== 'object' || Array.isArray(raw.blockedModules)) raw.blockedModules = {};
  return raw;
}

function save(cfg) {
  cfg.updated = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
}

function nowStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeKey(arg) {
  return String(arg || '').trim().toLowerCase();
}

function findBan(cfg, key) {
  return cfg.bannedAccounts.findIndex(b => (b.uuid && b.uuid === key) || (b.name && b.name === key));
}

function findBrick(cfg, key) {
  return cfg.brickedAccounts.findIndex(b => (b.uuid && b.uuid === key) || (b.name && b.name === key));
}

function mirrorPaths() {
  try {
    return new Set(JSON.parse(fs.readFileSync(MIRROR, 'utf8')).mainStart || []);
  } catch (_) {
    return new Set();
  }
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reason') flags.reason = argv[++i] || '';
    else if (argv[i] === '--uuid') flags.uuid = normalizeKey(argv[++i]);
    else if (argv[i] === '--name') flags.name = normalizeKey(argv[++i]);
    else if (argv[i] === '--screen') flags.screen = normalizeKey(argv[++i]);
    else if (argv[i] === '--wipe') flags.wipe = true;
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  const cfg = load();

  switch (cmd) {
    case undefined:
    case 'show': {
      console.log('kill switch :', cfg.killSwitch.active ? 'ACTIVO — ' + (cfg.killSwitch.reason || 'sin motivo') + (cfg.killSwitch.screen === 'bsod' ? ' [pantalla azul]' : '') : 'inactivo');
      console.log('baneados    :', cfg.bannedAccounts.length);
      for (const b of cfg.bannedAccounts) {
        console.log('  -', [b.uuid, b.name].filter(Boolean).join(' / '), b.reason ? '(' + b.reason + ')' : '');
      }
      console.log('ladrillados :', cfg.brickedAccounts.length);
      for (const b of cfg.brickedAccounts) {
        console.log('  -', [b.uuid, b.name].filter(Boolean).join(' / '), b.wipe ? '(wipe)' : '', b.reason ? '(' + b.reason + ')' : '');
      }
      const blocks = Object.keys(cfg.blockedModules);
      console.log('bloqueados  :', blocks.length);
      for (const p of blocks) console.log('  -', p, cfg.blockedModules[p] ? '(' + cfg.blockedModules[p] + ')' : '');
      console.log('actualizada :', cfg.updated);
      return;
    }

    case 'kill': {
      const mode = rest[0];
      if (mode === 'on') {
        cfg.killSwitch = { active: true, reason: flags.reason || '', since: nowStamp(), screen: flags.screen === 'bsod' ? 'bsod' : 'overlay' };
        console.log('[moderation] kill switch ACTIVADO' + (cfg.killSwitch.screen === 'bsod' ? ' (pantalla azul)' : '') + '. los clientes se apagan en <=5 min.');
      } else if (mode === 'off') {
        cfg.killSwitch = { active: false, reason: '', since: '', screen: 'overlay' };
        console.log('[moderation] kill switch desactivado. los clientes se restauran en <=5 min.');
      } else {
        die('uso: kill on|off [--reason "..."] [--screen bsod]');
      }
      break;
    }

    case 'ban': {
      const target = rest[0];
      if (!target && !flags.uuid && !flags.name) die('uso: ban <uuid|name> [--reason "..."]');
      const uuid = flags.uuid || (UUID_RE.test(target) ? normalizeKey(target) : '');
      const name = flags.name || (UUID_RE.test(target) ? '' : normalizeKey(target));
      if (!uuid && !name) die('ni uuid ni name: no sé a quién baneo');
      if (findBan(cfg, uuid || name) >= 0) die('ya está en la banlist');
      cfg.bannedAccounts.push({ uuid, name, reason: flags.reason || '', since: nowStamp() });
      console.log('[moderation] baneado:', [uuid, name].filter(Boolean).join(' / '));
      break;
    }

    case 'unban': {
      const key = normalizeKey(rest[0]);
      if (!key) die('uso: unban <uuid|name>');
      const idx = findBan(cfg, key);
      if (idx < 0) die('no está en la banlist: ' + key);
      const [gone] = cfg.bannedAccounts.splice(idx, 1);
      console.log('[moderation] desbaneado:', [gone.uuid, gone.name].filter(Boolean).join(' / '));
      break;
    }

    case 'brick': {
      const target = rest[0];
      if (!target && !flags.uuid && !flags.name) die('uso: brick <uuid|name> [--reason "..."] [--wipe]');
      const uuid = flags.uuid || (UUID_RE.test(target) ? normalizeKey(target) : '');
      const name = flags.name || (UUID_RE.test(target) ? '' : normalizeKey(target));
      if (!uuid && !name) die('ni uuid ni name: no sé a quién ladrillo');
      if (findBrick(cfg, uuid || name) >= 0) die('ya está en la bricklist');
      cfg.brickedAccounts.push({ uuid, name, reason: flags.reason || '', since: nowStamp(), wipe: !!flags.wipe });
      console.log('[moderation] LADRILLADO:', [uuid, name].filter(Boolean).join(' / '), flags.wipe ? '(pantalla azul + wipe local)' : '(pantalla azul)');
      break;
    }

    case 'unbrick': {
      const key = normalizeKey(rest[0]);
      if (!key) die('uso: unbrick <uuid|name>');
      const idx = findBrick(cfg, key);
      if (idx < 0) die('no está en la bricklist: ' + key);
      const [gone] = cfg.brickedAccounts.splice(idx, 1);
      console.log('[moderation] desladrillado:', [gone.uuid, gone.name].filter(Boolean).join(' / '));
      break;
    }

    case 'block': {
      // sin lowercase: los paths de raw.githubusercontent son case-sensitive
      const p = String(rest[0] || '').trim().replace(/\\/g, '/');
      if (!/^src\/[\w.\-]+(?:\/[\w.\-]+)*\.js$/.test(p) || p.split('/').some(s => s === '.' || s === '..')) {
        die('path raro: ' + p + ' (espero src/....js sin ..)');
      }
      if (!mirrorPaths().has(p)) console.warn('[moderation] ojo: ese path no está en mirror.json mainStart (¿existe?)');
      if (cfg.blockedModules[p] !== undefined) die('ya bloqueado: ' + p);
      cfg.blockedModules[p] = flags.reason || '';
      console.log('[moderation] bloqueado:', p, '— aplica en el próximo arranque (auto-reload de los clientes)');
      break;
    }

    case 'unblock': {
      const p = String(rest[0] || '').trim().replace(/\\/g, '/');
      if (cfg.blockedModules[p] === undefined) die('no está bloqueado: ' + p);
      delete cfg.blockedModules[p];
      console.log('[moderation] desbloqueado:', p);
      break;
    }

    default:
      die('comando desconocido: ' + cmd + ' (show|kill|ban|unban|block|unblock)');
  }

  save(cfg);
  console.log('[moderation] moderation.json escrito. commit + push para publicar.');
}

main();
