var MFB_KEY = "minifeather_api_v1";
var MFB_VERSION = "1.2.1";

var MFB_data = game.storage.get(MFB_KEY, { cap: { min: 0.5, max: 1.8 }, waypoints: [], entities: {}, cfg: {} });
if (!MFB_data.cap) MFB_data.cap = { min: 0.5, max: 1.8 };
if (!Array.isArray(MFB_data.waypoints)) MFB_data.waypoints = [];
if (!MFB_data.entities || typeof MFB_data.entities !== "object") MFB_data.entities = {};
if (!MFB_data.cfg || typeof MFB_data.cfg !== "object") MFB_data.cfg = {};

var MFB_entSeq = 0;

var MFB_admins = {};
var MFB_clients = {};
var MFB_players = {};
var MFB_rate = {};
var MFB_handlers = { link: [], unlink: [], message: [], clientMessage: [] };

function mfb_save() {
    game.storage.set(MFB_KEY, MFB_data);
}

function mfb_send(p, obj) {
    if (!p) return false;
    try {
        p.sendMessage("[MF:" + JSON.stringify(obj) + "]");
        return true;
    } catch (e) {
        console.log("[MFAPI] send fail: " + e);
        return false;
    }
}

function mfb_eachPlayer(fn) {
    for (var uuid in MFB_players) {
        var p = MFB_players[uuid];
        if (p) {
            try { fn(p); } catch (e) {}
        }
    }
}

function mfb_broadcast(obj) {
    var n = 0;
    mfb_eachPlayer(function (p) {
        if (mfb_send(p, obj)) n++;
    });
    return n;
}

function mfb_worldName() {
    return String(game.state || "planet");
}

function mfb_capFor(uuid, reportedPerm) {
    if (MFB_data.cap === null) return null;
    if (MFB_admins[uuid]) return null;
    if (typeof reportedPerm === "number" && reportedPerm >= 100) return null;
    return MFB_data.cap;
}

function mfb_emit(type, payload) {
    var list = MFB_handlers[type] || [];
    for (var i = 0; i < list.length; i++) {
        try { list[i](payload); } catch (e) {
            console.log("[MFAPI] handler " + type + " error: " + e);
        }
    }
}

function mfb_hello(p, uuid, perm) {
    mfb_send(p, {
        t: "hello",
        world: mfb_worldName(),
        cap: mfb_capFor(uuid, perm)
    });
    if (MFB_data.waypoints.length) {
        mfb_send(p, { t: "wp", items: MFB_data.waypoints });
    }
    var ents = [];
    for (var eid in MFB_data.entities) ents.push(MFB_data.entities[eid]);
    if (ents.length) mfb_send(p, { t: "ent-sync", items: ents });
    if (Object.keys(MFB_data.cfg).length) {
        mfb_send(p, { t: "cfg", cfg: MFB_data.cfg });
    }
}

function mfb_broadcastWaypoints() {
    return mfb_broadcast({ t: "wp", items: MFB_data.waypoints });
}

function mfb_broadcastCap() {
    mfb_eachPlayer(function (p) {
        mfb_send(p, {
            t: "cap",
            cap: mfb_capFor(p.uuid, 0),
            world: mfb_worldName()
        });
    });
}

function mfb_findPlayer(id) {
    if (!id) return null;
    id = String(id);
    if (MFB_players[id]) return MFB_players[id];
    var low = id.toLowerCase();
    for (var uuid in MFB_players) {
        var p = MFB_players[uuid];
        if (p && String(p.name).toLowerCase() === low) return p;
    }
    return null;
}

function mfb_relay(sender, msg) {
    var now = Date.now();
    var lim = MFB_rate[sender.uuid] || (MFB_rate[sender.uuid] = { n: 0, t: now });
    if (now - lim.t > 1000) { lim.t = now; lim.n = 0; }
    lim.n++;
    if (lim.n > 5) return -1;

    var data = msg.d;
    var raw;
    try { raw = JSON.stringify(data); } catch (e) { return 0; }
    if (raw.length > 512) return -2;

    var from = { name: sender.name, uuid: sender.uuid };
    var delivered = 0;
    var target = msg.to && msg.to !== "*" ? mfb_findPlayer(msg.to) : null;

    if (target) {
        if (mfb_send(target, { t: "msg", from: from, d: data })) delivered = 1;
    } else {
        mfb_eachPlayer(function (p) {
            if (p.uuid === sender.uuid) return;
            if (mfb_send(p, { t: "msg", from: from, d: data })) delivered++;
        });
    }

    mfb_emit("clientMessage", {
        from: from,
        to: msg.to || "*",
        data: data,
        delivered: delivered,
        player: sender
    });
    mfb_send(sender, { t: "ack", id: msg.id, delivered: delivered });
    return delivered;
}

game.commands.register("mf", {}, function (sender, args) {
    var msg;
    try {
        msg = JSON.parse(args.join(" "));
    } catch (e) {
        return;
    }
    if (!msg || typeof msg !== "object") return;

    var uuid = sender.uuid;
    var known = MFB_clients[uuid];
    MFB_clients[uuid] = {
        name: sender.name,
        uuid: uuid,
        lastSeen: Date.now(),
        perm: typeof msg.perm === "number" ? msg.perm : (known ? known.perm : 0),
        mods: Array.isArray(msg.mods) ? msg.mods : (known ? known.mods : [])
    };

    if (msg.t === "hello" || msg.t === "sync") {
        if (msg.t === "sync" && typeof msg.perm === "number" && msg.perm >= 100) {
            MFB_admins[uuid] = true;
        }
        var wasNew = !known;
        mfb_hello(sender, uuid, MFB_clients[uuid].perm);
        if (wasNew) mfb_emit("link", MFB_clients[uuid]);
        if (msg.t === "sync") {
            console.log("[MFAPI] linked: " + sender.name +
                " perm=" + MFB_clients[uuid].perm +
                " mods=" + (MFB_clients[uuid].mods || []).join(","));
        }
        return;
    }

    mfb_emit("message", { player: sender, msg: msg });

    if (msg.t === "relay") {
        mfb_relay(sender, msg);
    }

    if (msg.t === "cfg-set" && MFB_admins[sender.uuid]) {
        var key = String(msg.key || "");
        if (!/^[\w]+$/.test(key)) return;
        if (typeof msg.value === "boolean") {
            MFB_data.cfg[key] = msg.value;
            mfb_save();
            mfb_broadcast({ t: "cfg", cfg: MFB_data.cfg });
        }
    }

    if (msg.t === "cap-set" && MFB_admins[sender.uuid]) {
        if (msg.cap === null || msg.cap === undefined) {
            MiniFeather.setCap(null);
        } else if (msg.cap && isFinite(+msg.cap.min) && isFinite(+msg.cap.max)) {
            MiniFeather.setCap(+msg.cap.min, +msg.cap.max);
        }
    }
});

game.on("playerJoin", function (e) {
    MFB_players[e.player.uuid] = e.player;
    game.after(2, function () {
        mfb_hello(e.player, e.player.uuid, 0);
    });
});

game.on("playerQuit", function (e) {
    var p = e.player;
    if (!p) return;
    delete MFB_players[p.uuid];
    var had = MFB_clients[p.uuid];
    delete MFB_clients[p.uuid];
    delete MFB_admins[p.uuid];
    if (had) mfb_emit("unlink", had);
});

game.on("scriptLoad", function () {
    console.log("[MFAPI] v" + MFB_VERSION + " ready. cap=" +
        (MFB_data.cap ? MFB_data.cap.min + "-" + MFB_data.cap.max : "off") +
        " waypoints=" + MFB_data.waypoints.length);
});

game.commands.register("mfauth", { permission: "admin" }, function (sender) {
    MFB_admins[sender.uuid] = true;
    mfb_send(sender, { t: "cap", cap: null, world: mfb_worldName() });
    sender.sendMessage("\\green\\[MFAPI] Admin verified. No scale cap.");
});

game.commands.register("mflinked", { permission: "admin" }, function (sender) {
    var n = 0;
    for (var uuid in MFB_clients) {
        var c = MFB_clients[uuid];
        var ago = Math.max(0, Math.round((Date.now() - c.lastSeen) / 1000));
        sender.sendMessage("\\white\\" + c.name + " \\gray\\perm=" + c.perm +
            " " + ago + "s ago mods=" + (c.mods || []).join(","));
        n++;
    }
    if (!n) sender.sendMessage("\\yellow\\[MFAPI] No clients linked yet.");
});

game.commands.register("mfwp", { permission: "admin" }, function (sender, args) {
    var action = String(args[0] || "").toLowerCase();

    if (action === "add") {
        var name = String(args[1] || "").trim();
        if (!name) {
            sender.sendMessage("\\red\\Usage: /mfwp add <name>");
            return;
        }
        var pos = sender.pos;
        MiniFeather.addWaypoint(name, Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        sender.sendMessage("\\green\\[MFAPI] Waypoint '" + name + "' saved and broadcast.");
        return;
    }

    if (action === "del" || action === "remove") {
        var ok = MiniFeather.removeWaypoint(String(args[1] || ""));
        sender.sendMessage(ok
            ? "\\green\\[MFAPI] Waypoint removed."
            : "\\yellow\\[MFAPI] Waypoint not found.");
        return;
    }

    if (action === "list") {
        var list = MiniFeather.listWaypoints();
        if (!list.length) {
            sender.sendMessage("\\yellow\\[MFAPI] No waypoints.");
            return;
        }
        sender.sendMessage("\\aqua\\--- Waypoints (" + list.length + ") ---");
        for (var k = 0; k < list.length; k++) {
            var w = list[k];
            sender.sendMessage("\\white\\" + w.name + " \\gray\\(" + w.x + ", " + w.y + ", " + w.z + ")");
        }
        return;
    }

    if (action === "send") {
        mfb_broadcastWaypoints();
        sender.sendMessage("\\green\\[MFAPI] Waypoints re-sent.");
        return;
    }

    sender.sendMessage("\\red\\Usage: /mfwp add|del|list|send <name>");
});

game.commands.register("mfcap", { permission: "admin" }, function (sender, args) {
    if (String(args[0] || "").toLowerCase() === "off") {
        MiniFeather.setCap(null);
        sender.sendMessage("\\green\\[MFAPI] Cap disabled for everyone.");
        return;
    }
    var min = Number(args[0]);
    var max = Number(args[1]);
    if (!isFinite(min) || !isFinite(max)) {
        sender.sendMessage("\\red\\Usage: /mfcap <min> <max> | off");
        return;
    }
    MiniFeather.setCap(min, max);
    sender.sendMessage("\\green\\[MFAPI] Player cap: " + min + "x - " + max + "x");
});

game.commands.register("mfconfig", { permission: "admin" }, function (sender) {
    mfb_send(sender, { t: "gui-open", cfg: MFB_data.cfg, cap: MFB_data.cap });
});

var MiniFeather = {

    version: MFB_VERSION,

    send: function (player, obj) {
        return mfb_send(player, obj);
    },

    broadcast: function (obj) {
        return mfb_broadcast(obj);
    },

    setCap: function (min, max) {
        if (min === null || min === undefined) {
            MFB_data.cap = null;
        } else {
            var lo = Number(min);
            var hi = Number(max === undefined ? min : max);
            if (!isFinite(lo) || !isFinite(hi)) return false;
            if (lo > hi) { var t = lo; lo = hi; hi = t; }
            MFB_data.cap = { min: lo, max: hi };
        }
        mfb_save();
        mfb_broadcastCap();
        return true;
    },

    getCap: function () {
        return MFB_data.cap ? { min: MFB_data.cap.min, max: MFB_data.cap.max } : null;
    },

    capFor: function (player) {
        return mfb_capFor(player && player.uuid, 0);
    },

    isAdmin: function (uuid) {
        return !!MFB_admins[uuid];
    },

    grantAdmin: function (uuid) {
        MFB_admins[uuid] = true;
        var p = MFB_players[uuid];
        if (p) mfb_send(p, { t: "cap", cap: null, world: mfb_worldName() });
        return true;
    },

    revokeAdmin: function (uuid) {
        delete MFB_admins[uuid];
        var p = MFB_players[uuid];
        if (p) {
            mfb_send(p, { t: "cap", cap: mfb_capFor(uuid, 0), world: mfb_worldName() });
        }
        return true;
    },

    addWaypoint: function (name, x, y, z) {
        name = String(name || "").trim();
        if (!name || !isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
        var wp = { name: name, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
        var replaced = false;
        for (var i = 0; i < MFB_data.waypoints.length; i++) {
            if (MFB_data.waypoints[i].name.toLowerCase() === name.toLowerCase()) {
                MFB_data.waypoints[i] = wp;
                replaced = true;
                break;
            }
        }
        if (!replaced) MFB_data.waypoints.push(wp);
        if (MFB_data.waypoints.length > 100) MFB_data.waypoints.shift();
        mfb_save();
        mfb_broadcastWaypoints();
        return true;
    },

    removeWaypoint: function (name) {
        var target = String(name || "").trim().toLowerCase();
        var kept = [];
        for (var j = 0; j < MFB_data.waypoints.length; j++) {
            if (MFB_data.waypoints[j].name.toLowerCase() !== target) kept.push(MFB_data.waypoints[j]);
        }
        var removed = kept.length !== MFB_data.waypoints.length;
        MFB_data.waypoints = kept;
        if (removed) {
            mfb_save();
            mfb_broadcastWaypoints();
        }
        return removed;
    },

    listWaypoints: function () {
        var out = [];
        for (var k = 0; k < MFB_data.waypoints.length; k++) {
            var w = MFB_data.waypoints[k];
            out.push({ name: w.name, x: w.x, y: w.y, z: w.z });
        }
        return out;
    },

    sendWaypoints: function (player) {
        if (player) return mfb_send(player, { t: "wp", items: MFB_data.waypoints });
        return mfb_broadcastWaypoints();
    },

    clientCommand: function (player, text) {
        return mfb_send(player, { t: "cmd", text: String(text || "") });
    },

    spawnEntity: function (opts) {
        opts = opts || {};
        var file = String(opts.model || "");
        if (!/^[\w.\-\/]+\.geo\.json$/.test(file)) return null;
        var id = opts.id || ("mfent" + (++MFB_entSeq) + "_" + Date.now() % 100000);
        var ent = {
            id: id,
            model: file,
            x: Math.floor(+opts.x || 0),
            y: Math.floor(+opts.y || 0),
            z: Math.floor(+opts.z || 0),
            scale: isFinite(+opts.scale) ? +opts.scale : 1,
            yaw: isFinite(+opts.yaw) ? +opts.yaw : 0,
            anim: opts.anim || null,
            texture: opts.texture || null,
            perPlayer: !!opts.perPlayer
        };
        MFB_data.entities[id] = ent;
        mfb_save();
        mfb_broadcast({ t: "ent", a: "spawn", ent: ent });
        return id;
    },

    moveEntity: function (id, x, y, z, yaw) {
        var ent = MFB_data.entities[id];
        if (!ent) return false;
        ent.x = Math.floor(+x || ent.x);
        ent.y = Math.floor(+y || ent.y);
        ent.z = Math.floor(+z || ent.z);
        if (yaw != null) ent.yaw = +yaw;
        mfb_save();
        mfb_broadcast({ t: "ent", a: "move", id: id, x: ent.x, y: ent.y, z: ent.z, yaw: ent.yaw });
        return true;
    },

    scaleEntity: function (id, scale) {
        var ent = MFB_data.entities[id];
        if (!ent || !isFinite(+scale)) return false;
        ent.scale = Math.max(0.01, Math.min(30, +scale));
        mfb_save();
        mfb_broadcast({ t: "ent", a: "scale", id: id, scale: ent.scale });
        return true;
    },

    despawnEntity: function (id) {
        if (!MFB_data.entities[id]) return false;
        delete MFB_data.entities[id];
        mfb_save();
        mfb_broadcast({ t: "ent", a: "despawn", id: id });
        return true;
    },

    listEntities: function () {
        var out = [];
        for (var id in MFB_data.entities) out.push(MFB_data.entities[id]);
        return out;
    },

    setConfig: function (player, cfg) {
        if (!cfg || typeof cfg !== "object") return false;
        var raw;
        try { raw = JSON.stringify(cfg); } catch (e) { return false; }
        if (raw.length > 4096) return false;
        if (player) return mfb_send(player, { t: "cfg", cfg: cfg });
        MFB_data.cfg = cfg;
        mfb_save();
        return mfb_broadcast({ t: "cfg", cfg: cfg }) > 0;
    },

    getConfig: function () {
        return MFB_data.cfg;
    },

    clearConfig: function () {
        MFB_data.cfg = {};
        mfb_save();
        mfb_broadcast({ t: "cfg-clear" });
        return true;
    },

    sendBetween: function (fromPlayer, toPlayer, data) {
        var raw;
        try { raw = JSON.stringify(data); } catch (e) { return false; }
        if (raw.length > 512) return false;
        return mfb_send(toPlayer, {
            t: "msg",
            from: { name: fromPlayer.name, uuid: fromPlayer.uuid },
            d: data
        });
    },

    setClientScale: function (player, scale) {
        var s = Number(scale);
        if (!isFinite(s)) return false;
        return mfb_send(player, { t: "scale", scale: s });
    },

    linked: function () {
        var out = [];
        for (var uuid in MFB_clients) {
            var c = MFB_clients[uuid];
            out.push({
                name: c.name,
                uuid: c.uuid,
                lastSeen: c.lastSeen,
                perm: c.perm,
                mods: c.mods
            });
        }
        return out;
    },

    on: function (type, fn) {
        if (!MFB_handlers[type] || typeof fn !== "function") return false;
        MFB_handlers[type].push(fn);
        return true;
    }
};

globalThis.MiniFeather = MiniFeather;
