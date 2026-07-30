(function () {
  'use strict';

  const CONFIG = {
    logo: "https://i.ibb.co/Y48gfKC1/New-Project-8.png",
    background: "https://raw.githubusercontent.com/EstebanGrp/MIniFeather-Client/main/default-DKNlYibk%20(2).png",
    discord: "https://discord.com/invite/ksmp",
    title: "MiniFeather Client",
    welcomeText: `Welcome To MiniFeather Client! <span style="color:#888;font-size:12px;margin-left:8px;">Best Client Out There!</span>`,
    discordReplacements: {
      "Find teammates and squad up for any mode": "Find MiniFeather Client members and squad up",
      "Be first to hear about updates and new content": "Get MiniFeather updates and news",
      "Giveaways, events and booster-only perks": "MiniFeather events, giveaways and perks",
      "Chat with the devs and the rest of the community": "Chat with the MiniFeather's community",
      "Join the Miniblox community": "Join the MiniFeather's community!",
    },
    adSelectors: [
      "iframe[src*='ads']",
      "iframe[src*='doubleclick']",
      "iframe[src*='googlesyndication']",
      "[id*='ad-container']",
      "[class*='ad-container']",
      "[id*='advert']",
      "[class*='advert']",
    ],
    fontUrl: "https://raw.githubusercontent.com/EstebanGrp/MIniFeather-Client/refs/heads/main/Faithful.ttf",
    skins: [
      "alice", "bob", "techno", "thebiggelo", "corrupted", "diana", "strange", "endoskeleton",
      "ganyu", "georgenotfound", "holly", "hutao", "jake", "james", "klee", "kyoko",
      "adele", "chris", "deadpool", "galactus", "heather", "ironman", "suit", "levi", "lexi",
      "natalie", "remus", "sara", "transformer", "vindicate", "adventure", "aether", "apex",
      "ariel", "aurora", "celeste", "cody", "ember", "finn", "glory", "hunter", "katie",
      "nova", "panda", "raven", "seraphina", "vain", "zane"
    ],
  };

  console.log("[MiniFeather] Loading v3.0...");

  let settings = {
    rebrand: true,
    supportAds: false,
    discord: true,
    keystrokes: true,
  };

  chrome.storage.local.get(["settings"], (data) => {
    if (data.settings) settings = { ...settings, ...data.settings };
  });

  let pendingTick = false;
  function scheduleUpdate() {
    if (pendingTick) return;
    pendingTick = true;
    requestAnimationFrame(() => {
      pendingTick = false;
      update();
    });
  }

  function replaceTextNodes(targetText, replacement) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue.includes(targetText)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue.split(targetText).join(replacement);
    }
  }

  function injectFont() {
    const style = document.createElement("style");
    style.id = "minifeather-font";
    style.textContent = `
      @font-face {
        font-family: 'Faithful';
        src: url('${CONFIG.fontUrl}') format('truetype');
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }
      *, *::before, *::after {
        font-family: 'Faithful', 'Inter', 'Arial', sans-serif !important;
      }
    `;
    document.head.appendChild(style);

    function patchCanvas() {
      document.querySelectorAll("canvas").forEach(canvas => {
        const ctx = canvas.getContext("2d");
        if (ctx && ctx.font && !ctx._minifeatherFont) {
          ctx._minifeatherFont = true;
          const origFont = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
          if (origFont) {
            Object.defineProperty(ctx, "font", {
              get() { return origFont.get.call(this); },
              set(val) {
                origFont.set.call(this, val.replace(/font-family:\s*[^;"]+/g, "font-family: Faithful"));
              },
            });
          }
        }
      });
    }
    patchCanvas();
    const canvasObserver = new MutationObserver(() => patchCanvas());
    canvasObserver.observe(document.body, { childList: true, subtree: true });
  }

  function changeTitle() {
    if (document.title !== CONFIG.title) document.title = CONFIG.title;
  }

  function changeFavicon() {
    let icon = document.querySelector("link[rel~='icon']");
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    if (icon.href !== CONFIG.logo) icon.href = CONFIG.logo;
  }

  function replaceLogo() {
    document.querySelectorAll("img").forEach(img => {
      if ((img.alt === "Miniblox" || img.src.includes("miniblox-icon")) && img.src !== CONFIG.logo) {
        img.src = CONFIG.logo;
      }
    });
  }

  function replaceBackground() {
    document.querySelectorAll("img").forEach(img => {
      if (img.src.includes("default-B1Dv6Hww") && img.src !== CONFIG.background) {
        img.src = CONFIG.background;
      }
    });
  }

  function replaceDiscordInput() {
    document.querySelectorAll("input").forEach(input => {
      if (input.value && input.value.includes("discord.gg") && input.value !== CONFIG.discord) {
        input.value = CONFIG.discord;
        input.setAttribute("value", CONFIG.discord);
      }
    });
  }

  function hideDiscordImage() {
    document.querySelectorAll("img").forEach(img => {
      if (img.alt === "Join our Discord" || img.src.includes("join-discord")) {
        img.style.display = "none";
      }
    });
  }

  function changeDiscordButton() {
    document.querySelectorAll("button").forEach(btn => {
      if (btn.innerText.includes("Join the Discord") && !btn.dataset.mf) {
        btn.innerHTML = btn.innerHTML.split("Join the Discord").join("Join Kings SMP");
        btn.dataset.mf = "1";
      }
    });
  }

  function changeDiscordDescriptions() {
    for (const [original, replacement] of Object.entries(CONFIG.discordReplacements)) {
      document.querySelectorAll("p").forEach(p => {
        if (p.innerText === original && p.dataset.mf !== "1") {
          p.innerText = replacement;
          p.dataset.mf = "1";
        }
      });
      replaceTextNodes(original, replacement);
    }
  }

  function changeWelcomeText() {
    document.querySelectorAll("p.css-1dxm2zz").forEach(p => {
      if (p.innerText.toLowerCase().startsWith("welcome back") && p.dataset.mf !== "1") {
        p.innerHTML = CONFIG.welcomeText;
        p.dataset.mf = "1";
      }
    });
  }

  function blockAds() {
    CONFIG.adSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(ad => {
        ad.style.display = "none";
      });
    });
  }

  function showAds() {
    CONFIG.adSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(ad => {
        ad.style.display = "";
      });
    });
  }

  document.addEventListener(
    "click",
    e => {
      const btn = e.target.closest("button");
      if (btn && btn.innerText.includes("Join Kings SMP")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.open(CONFIG.discord, "_blank");
      }
    },
    true
  );

  function hookClipboard() {
    if (!navigator.clipboard || navigator.clipboard._mfHooked) return;
    const oldWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      if (text && text.includes("discord.gg")) {
        text = CONFIG.discord;
      }
      return oldWrite(text);
    };
    navigator.clipboard._mfHooked = true;
  }

  function initFPSCounter() {
    const saved = JSON.parse(localStorage.getItem("minifeather-fps-pos")) || { x: 12, y: 12 };

    const box = document.createElement("div");
    box.id = "minifeather-fps";
    box.style.cssText = `
      position:fixed;
      left:${saved.x}px;
      top:${saved.y}px;
      padding:8px 12px;
      background:rgba(18,18,18,.88);
      border:1px solid rgba(255,255,255,.08);
      border-radius:10px;
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      color:white;
      font-family:'Faithful',Inter,Arial,sans-serif;
      font-size:14px;
      font-weight:600;
      box-shadow:0 4px 18px rgba(0,0,0,.35);
      z-index:999999;
      user-select:none;
      cursor:move;
    `;
    document.body.appendChild(box);

    let frames = 0;
    let last = performance.now();
    let visible = true;

    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      if (visible) {
        last = performance.now();
        frames = 0;
      }
    });

    function loop(now) {
      if (visible) {
        frames++;
        if (now - last >= 1000) {
          const fps = frames;
          const color = fps >= 120 ? "#22c55e" : fps >= 60 ? "#facc15" : "#ef4444";
          box.innerHTML = `
            <span style="color:#3b82f6;font-weight:700;">MiniFeather</span>
            <span style="color:#666;">|</span>
            <span style="color:${color};font-weight:700;">${fps}</span>
            <span style="color:#aaa;"> FPS</span>
          `;
          frames = 0;
          last = now;
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    let dragging = false, offX = 0, offY = 0;
    box.addEventListener("mousedown", e => {
      dragging = true;
      offX = e.clientX - box.offsetLeft;
      offY = e.clientY - box.offsetTop;
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      box.style.left = e.clientX - offX + "px";
      box.style.top = e.clientY - offY + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem("minifeather-fps-pos", JSON.stringify({ x: box.offsetLeft, y: box.offsetTop }));
    });
  }

  function initKeystrokes() {
    const savedPos = JSON.parse(localStorage.getItem("minifeather-keystroke-pos")) || { x: 20, y: 200 };

    const style = document.createElement("style");
    style.id = "minifeather-keystroke-css";
    style.textContent = `
      #mf-keystrokes * { box-sizing:border-box; }
      .mf-key {
        display:flex;align-items:center;justify-content:center;
        background:rgba(15,15,15,.82);color:#666;
        border:2px solid rgba(255,255,255,.08);border-radius:10px;
        font-family:'Faithful',Inter,Arial,sans-serif;font-weight:700;
        transition:background .06s ease,color .06s ease,border-color .06s ease,transform .06s ease,box-shadow .06s ease;
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
        position:relative;overflow:hidden;
      }
      .mf-key.active {
        background:rgba(59,130,246,.92);color:#fff;
        border-color:rgba(96,165,250,.8);
        transform:scale(0.90);
        box-shadow:0 0 14px rgba(59,130,246,.45),inset 0 0 8px rgba(255,255,255,.15);
      }
      .mf-key .mf-cps {
        position:absolute;bottom:2px;right:4px;
        font-size:9px;color:rgba(255,255,255,.5);font-weight:600;
      }
      .mf-key.active .mf-cps { color:rgba(255,255,255,.8); }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.id = "mf-keystrokes";
    container.style.cssText = `
      position:fixed;left:${savedPos.x}px;top:${savedPos.y}px;
      z-index:999997;display:flex;flex-direction:column;align-items:center;gap:5px;
      user-select:none;cursor:move;
    `;

    const buttons = {};
    const clickCounters = { LMB: [], RMB: [] };

    function makeKey(key, label, w, h, fontSize) {
      const btn = document.createElement("div");
      btn.className = "mf-key";
      btn.style.width = w + "px";
      btn.style.height = h + "px";
      btn.style.fontSize = fontSize + "px";
      btn.innerHTML = `<span>${label}</span>`;
      buttons[key] = btn;
      return btn;
    }

    function makeKeyWithCPS(key, label, w, h, fontSize) {
      const btn = makeKey(key, label, w, h, fontSize);
      const cps = document.createElement("span");
      cps.className = "mf-cps";
      cps.textContent = "0";
      btn.appendChild(cps);
      return btn;
    }

    function updateCPS(key) {
      const now = performance.now();
      clickCounters[key] = clickCounters[key].filter(t => now - t < 1000);
      const btn = buttons[key];
      if (btn) {
        const cpsEl = btn.querySelector(".mf-cps");
        if (cpsEl) cpsEl.textContent = clickCounters[key].length;
      }
    }

    function makeRow(keys) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:5px;justify-content:center;";
      keys.forEach(k => row.appendChild(k));
      return row;
    }

    container.appendChild(makeRow([makeKey("KeyW", "W", 52, 52, 17)]));
    container.appendChild(makeRow([
      makeKey("KeyA", "A", 52, 52, 17),
      makeKey("KeyS", "S", 52, 52, 17),
      makeKey("KeyD", "D", 52, 52, 17),
    ]));

    container.appendChild(makeRow([
      makeKeyWithCPS("LMB", "L", 80, 36, 13),
      makeKeyWithCPS("RMB", "R", 80, 36, 13),
    ]));

    const space = makeKey("Space", "SPACE", 165, 32, 11);
    space.style.letterSpacing = "2px";
    container.appendChild(space);

    document.body.appendChild(container);

    function activate(key) {
      const btn = buttons[key];
      if (btn) btn.classList.add("active");
    }
    function deactivate(key) {
      const btn = buttons[key];
      if (btn) btn.classList.remove("active");
    }

    document.addEventListener("keydown", e => {
      if (buttons[e.code]) activate(e.code);
    });
    document.addEventListener("keyup", e => {
      if (buttons[e.code]) deactivate(e.code);
    });

    document.addEventListener("mousedown", e => {
      if (e.button === 0) { activate("LMB"); clickCounters.LMB.push(performance.now()); updateCPS("LMB"); }
      if (e.button === 2) { activate("RMB"); clickCounters.RMB.push(performance.now()); updateCPS("RMB"); }
    });
    document.addEventListener("mouseup", e => {
      if (e.button === 0) deactivate("LMB");
      if (e.button === 2) deactivate("RMB");
    });

    setInterval(() => { updateCPS("LMB"); updateCPS("RMB"); }, 200);

    let dragging = false, offX = 0, offY = 0;
    container.addEventListener("mousedown", e => {
      dragging = true;
      offX = e.clientX - container.offsetLeft;
      offY = e.clientY - container.offsetTop;
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      container.style.left = e.clientX - offX + "px";
      container.style.top = e.clientY - offY + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem("minifeather-keystroke-pos", JSON.stringify({
        x: container.offsetLeft, y: container.offsetTop,
      }));
    });
  }

  let guiSettings = {};

  function initGUI() {
    chrome.storage.local.get(["settings"], (data) => {
      guiSettings = data.settings || {
        rebrand: true,
        supportAds: false,
        discord: true,
        keystrokes: true,
      };

      const overlay = document.createElement("div");
      overlay.id = "mf-gui-overlay";
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.55);
        backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
        z-index:999998;display:none;
      `;

      const panel = document.createElement("div");
      panel.id = "mf-gui";
      panel.style.cssText = `
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        width:340px;background:rgba(15,15,15,.96);
        border:1px solid rgba(255,255,255,.1);border-radius:16px;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
        z-index:999999;font-family:'Faithful',Inter,Arial,sans-serif;
        color:#e0e0e0;overflow:hidden;
        transition:opacity .15s ease;opacity:0;
        display:none;pointer-events:none;
      `;

      panel.innerHTML = `
        <div id="mf-gui-header" style="
          display:flex;align-items:center;gap:10px;
          padding:16px 20px;cursor:move;
          background:linear-gradient(135deg,#1a1a2e,#16213e);
          border-bottom:1px solid rgba(255,255,255,.06);
        ">
          <img src="${CONFIG.logo}" style="width:28px;height:28px;border-radius:6px;pointer-events:none;">
          <div>
            <div style="font-size:16px;font-weight:700;color:#fff;">MiniFeather Client</div>
            <div style="font-size:11px;color:#666;">v3.0 · Right Shift to toggle</div>
          </div>
          <button id="mf-gui-close" style="
            margin-left:auto;background:none;border:none;color:#666;
            font-size:22px;cursor:pointer;padding:0 4px;line-height:1;
          ">&times;</button>
        </div>

        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;">

          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;font-weight:600;">Features</div>

          <label class="mf-toggle" data-key="rebrand" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
            <span style="font-size:14px;">Rebrand</span>
            <input type="checkbox" ${guiSettings.rebrand ? "checked" : ""}>
          </label>

          <label class="mf-toggle" data-key="supportAds" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
            <span style="font-size:14px;">Support devs with ads :D</span>
            <input type="checkbox" ${guiSettings.supportAds ? "checked" : ""}>
          </label>

          <label class="mf-toggle" data-key="discord" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
            <span style="font-size:14px;">Discord Redirect</span>
            <input type="checkbox" ${guiSettings.discord ? "checked" : ""}>
          </label>

          <label class="mf-toggle" data-key="keystrokes" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
          <span style="font-size:14px;">Keystrokes</span>
          <input type="checkbox" ${guiSettings.keystrokes ? "checked" : ""}>
        </label>

        <label class="mf-toggle" id="mf-spritesheet-toggle" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
          <span style="font-size:14px;">Custom Spritesheet</span>
          <input type="checkbox" id="mf-spritesheet-checkbox" checked>
        </label>

          <div style="height:1px;background:rgba(255,255,255,.06);"></div>

          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;font-weight:600;">Skin Changer</div>

          <select id="mf-skin-select" style="
            width:100%;padding:8px 10px;background:rgba(30,30,30,.8);border:1px solid rgba(255,255,255,.1);
            border-radius:8px;color:#e0e0e0;font-size:13px;font-family:'Faithful',Inter,Arial,sans-serif;
          ">
            <option value="">-- Select Skin --</option>
          </select>

          <input type="text" id="mf-skin-url" placeholder="Custom URL (optional)" style="
            width:100%;padding:8px 10px;background:rgba(30,30,30,.8);border:1px solid rgba(255,255,255,.1);
            border-radius:8px;color:#e0e0e0;font-size:13px;font-family:'Faithful',Inter,Arial,sans-serif;
          ">

          <input type="file" id="mf-skin-file" accept="image/*" style="
            width:100%;padding:6px;background:rgba(30,30,30,.8);border:1px solid rgba(255,255,255,.1);
            border-radius:8px;color:#999;font-size:12px;font-family:'Faithful',Inter,Arial,sans-serif;
          ">

          <div style="display:flex;gap:8px;">
            <button id="mf-skin-apply" style="
              flex:1;padding:8px;background:#22c55e;border:none;border-radius:8px;
              color:#fff;font-size:12px;font-weight:600;cursor:pointer;
            ">Apply</button>
            <button id="mf-skin-reset" style="
              flex:1;padding:8px;background:#ef4444;border:none;border-radius:8px;
              color:#fff;font-size:12px;font-weight:600;cursor:pointer;
            ">Reset All</button>
          </div>

          <div id="mf-skin-status" style="font-size:11px;color:#22c55e;text-align:center;min-height:14px;"></div>

          <div style="max-height:100px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;" id="mf-active-skins"></div>

          <div style="height:1px;background:rgba(255,255,255,.06);"></div>

          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;font-weight:600;">Links</div>

          <button id="mf-gui-discord" style="
            display:flex;align-items:center;justify-content:center;gap:8px;
            padding:10px;background:#5865F2;border:none;border-radius:8px;
            color:#fff;font-size:13px;font-weight:600;cursor:pointer;width:100%;
          ">Join Kings SMP</button>

          <div style="font-size:10px;color:#444;text-align:center;">Made by MiniFeather</div>
        </div>

        <style>
          .mf-toggle input {
            appearance:none;width:38px;height:22px;border-radius:11px;
            background:#333;position:relative;cursor:pointer;transition:background .2s;
          }
          .mf-toggle input::after {
            content:'';position:absolute;top:3px;left:3px;
            width:16px;height:16px;border-radius:50%;background:#888;transition:.2s;
          }
          .mf-toggle input:checked { background:#3b82f6; }
          .mf-toggle input:checked::after { transform:translateX(16px);background:#fff; }
        </style>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(panel);

      function showGUI() {
        overlay.style.display = "block";
        panel.style.display = "block";
        panel.style.pointerEvents = "auto";
        requestAnimationFrame(() => { panel.style.opacity = "1"; });
      }
      function hideGUI() {
        overlay.style.display = "none";
        panel.style.opacity = "0";
        panel.style.pointerEvents = "none";
        setTimeout(() => { panel.style.display = "none"; }, 150);
      }
      function toggleGUI() {
        if (overlay.style.display === "block") hideGUI();
        else showGUI();
      }

      let rightShiftDown = false;
      document.addEventListener("keydown", e => {
        if (e.code === "ShiftRight" && !rightShiftDown) {
          rightShiftDown = true;
          toggleGUI();
        }
      });
      document.addEventListener("keyup", e => {
        if (e.code === "ShiftRight") rightShiftDown = false;
      });

      overlay.addEventListener("click", hideGUI);
      document.getElementById("mf-gui-close").addEventListener("click", hideGUI);

      document.getElementById("mf-gui-discord").addEventListener("click", () => {
        window.open(CONFIG.discord, "_blank");
      });

      const skinSelect = document.getElementById("mf-skin-select");
      CONFIG.skins.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        skinSelect.appendChild(opt);
      });

      function refreshActiveSkins() {
        chrome.runtime.sendMessage({ type: "getSkins" }, (res) => {
          const container = document.getElementById("mf-active-skins");
          container.innerHTML = "";
          if (res && res.skins) {
            const entries = Object.entries(res.skins);
            if (entries.length === 0) {
              container.innerHTML = '<div style="font-size:11px;color:#555;text-align:center;padding:4px;">No active skins</div>';
              return;
            }
            entries.forEach(([name]) => {
              const item = document.createElement("div");
              item.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#1a1a1a;border-radius:6px;font-size:11px;";
              item.innerHTML = `<span>${name}</span>`;
              const removeBtn = document.createElement("button");
              removeBtn.textContent = "Remove";
              removeBtn.style.cssText = "padding:3px 8px;font-size:10px;background:#ef4444;border:none;border-radius:4px;color:#fff;cursor:pointer;";
              removeBtn.addEventListener("click", () => {
                chrome.runtime.sendMessage({ type: "resetSkin", skinName: name }, () => {
                  showSkinStatus(`Skin "${name}" removed!`, "#facc15");
                  refreshActiveSkins();
                });
              });
              item.appendChild(removeBtn);
              container.appendChild(item);
            });
          }
        });
      }

      function showSkinStatus(msg, color = "#22c55e") {
        const el = document.getElementById("mf-skin-status");
        el.textContent = msg;
        el.style.color = color;
      }

      document.getElementById("mf-skin-apply").addEventListener("click", () => {
        const skinName = skinSelect.value;
        const customUrl = document.getElementById("mf-skin-url").value.trim();
        const file = document.getElementById("mf-skin-file").files[0];

        if (!skinName) {
          showSkinStatus("Select a skin first", "#ef4444");
          return;
        }

        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            chrome.runtime.sendMessage(
              { type: "setSkin", skinName, customUrl: e.target.result },
              () => {
                showSkinStatus(`Skin "${skinName}" applied!`);
                refreshActiveSkins();
              }
            );
          };
          reader.readAsDataURL(file);
        } else if (customUrl) {
          chrome.runtime.sendMessage(
            { type: "setSkin", skinName, customUrl },
            () => {
              showSkinStatus(`Skin "${skinName}" applied!`);
              refreshActiveSkins();
            }
          );
        } else {
          showSkinStatus("Enter a URL or upload a file", "#ef4444");
        }
      });

      document.getElementById("mf-skin-reset").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "resetAllSkins" }, () => {
          showSkinStatus("All skins reset!", "#ef4444");
          refreshActiveSkins();
        });
      });

      refreshActiveSkins();

      chrome.runtime.sendMessage({ type: "getSpritesheet" }, (res) => {
        const cb = document.getElementById("mf-spritesheet-checkbox");
        if (res && res.success) cb.checked = res.enabled;
      });

      document.getElementById("mf-spritesheet-checkbox").addEventListener("change", (e) => {
        chrome.runtime.sendMessage({ type: "setSpritesheet", enabled: e.target.checked });
      });

      panel.querySelectorAll(".mf-toggle").forEach(label => {
        const input = label.querySelector("input");
        const key = label.dataset.key;
        input.addEventListener("change", () => {
          guiSettings[key] = input.checked;
          settings[key] = input.checked;
          chrome.storage.local.set({ settings: guiSettings });
          applyGuiSettings();
        });
      });

      applyGuiSettings();

      const header = document.getElementById("mf-gui-header");
      let dragging = false, offX = 0, offY = 0;

      header.addEventListener("mousedown", e => {
        if (e.target.id === "mf-gui-close") return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        offX = e.clientX - rect.left;
        offY = e.clientY - rect.top;
        panel.style.transform = "none";
      });
      document.addEventListener("mousemove", e => {
        if (!dragging) return;
        const x = Math.max(0, Math.min(e.clientX - offX, window.innerWidth - 340));
        const y = Math.max(0, Math.min(e.clientY - offY, window.innerHeight - 200));
        panel.style.left = x + "px";
        panel.style.top = y + "px";
      });
      document.addEventListener("mouseup", () => { dragging = false; });
    });
  }

  function injectFeatherButton() {
    let btn = document.getElementById("mf-sidebar-btn");
    if (btn) return;

    btn = document.createElement("div");
    btn.id = "mf-sidebar-btn";
    btn.className = "css-1yohxqj";
    btn.style.cssText = `
      display:flex;align-items:center;justify-content:center;
    `;
    const innerBtn = document.createElement("button");
    innerBtn.type = "button";
    innerBtn.className = "chakra-button css-7qs6ql";
    innerBtn.style.cssText = `
      display:flex;flex-direction:column;align-items:center;gap:2px;
      color:rgb(201,184,255);font-family:'Faithful',Inter,Arial,sans-serif;
    `;
    innerBtn.innerHTML = `
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="font-size:24px;color:#60a5fa;">
        <rect x="9" y="2" width="6" height="1"></rect>
        <rect x="8" y="3" width="8" height="1"></rect>
        <rect x="7" y="4" width="10" height="1"></rect>
        <rect x="6" y="5" width="12" height="1"></rect>
        <rect x="5" y="6" width="14" height="1"></rect>
        <rect x="4" y="7" width="16" height="1"></rect>
        <rect x="3" y="8" width="18" height="1"></rect>
        <rect x="3" y="9" width="6" height="1"></rect>
        <rect x="2" y="10" width="4" height="1"></rect>
        <rect x="2" y="11" width="3" height="1"></rect>
        <rect x="1" y="12" width="3" height="1"></rect>
        <rect x="1" y="13" width="2" height="1"></rect>
        <rect x="0" y="14" width="2" height="1"></rect>
        <rect x="0" y="15" width="2" height="1"></rect>
        <rect x="1" y="16" width="2" height="1"></rect>
        <rect x="2" y="17" width="3" height="1"></rect>
        <rect x="3" y="18" width="4" height="1"></rect>
        <rect x="4" y="19" width="6" height="1"></rect>
        <rect x="6" y="20" width="8" height="1"></rect>
      </svg>
      <span style="font-size:10px;font-weight:600;">Feather</span>
    `;
    btn.appendChild(innerBtn);

    innerBtn.addEventListener("click", () => {
      const overlay = document.getElementById("mf-gui-overlay");
      const panel = document.getElementById("mf-gui");
      if (overlay && panel) {
        overlay.style.display = "block";
        panel.style.display = "block";
        panel.style.pointerEvents = "auto";
        requestAnimationFrame(() => { panel.style.opacity = "1"; });
      }
    });

    function tryInject() {
      if (document.getElementById("mf-sidebar-btn")) return true;
      const btns = document.querySelectorAll("button");
      const settingsBtn = Array.from(btns).find(b => {
        const t = b.innerText?.trim();
        return t === "Settings" || t === "Ajustes" || t === "Configuración" || t === "Inicio" || t === "Home";
      });
      if (settingsBtn) {
        const wrapper = settingsBtn.parentElement;
        const sidebar = wrapper.parentElement;
        if (sidebar) {
          sidebar.insertBefore(btn, sidebar.firstChild);
          return true;
        }
      }
      return false;
    }

    if (!tryInject()) {
      const observer = new MutationObserver(() => {
        if (tryInject()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15000);
    }
  }

  function applyGuiSettings() {
    const ksContainer = document.getElementById("mf-keystrokes");
    if (ksContainer) ksContainer.style.display = settings.keystrokes ? "flex" : "none";

    if (settings.supportAds) {
      showAds();
    } else {
      blockAds();
    }

    if (!settings.rebrand) {
      document.querySelectorAll("img").forEach(img => {
        if (img.dataset.mf === "1") {
          img.src = img.dataset.originalSrc || img.src;
        }
      });
    }
  }

  function initChatFeatures() {
    const style = document.createElement("style");
    style.textContent = `
      .chat-gif { max-width:64px; max-height:64px; vertical-align:middle; border-radius:4px; display:inline-block; }
      .yt-wrapper { display:block;width:100%;max-width:320px;margin:6px 0;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.5); }
      .chat-meme-wrapper { display:block;width:100%;margin-top:5px; }
      .chat-meme-wrapper video { max-width:240px;border-radius:8px; }
    `;
    document.head.appendChild(style);

    const GIF_BASE = chrome.runtime.getURL("memes/gif/");
    const GIF_LIST = [
      "84-years.gif", "1000-yard-stare-cat-meme.gif", "aaaah-cat.gif", "beard-bear.gif",
      "cat-disgusted.gif", "cat-meme.gif", "cat-meme-cat.gif", "chat-pouce.gif",
      "clappi-clappi-clappi.gif", "devil-cat-evil.gif", "hands-down-meme.gif", "kermit.gif",
      "lfg-lets-go.gif", "memes2022funny-meme.gif", "question-emoji.gif", "scary-cat.gif",
      "shocked-shocked-cat.gif", "shrek-rizz-shrek-meme.gif", "ugly-plankton-meme-ugly-plankton.gif"
    ];
    const gifCache = {};
    function getGif(name) {
      const k = name.toLowerCase();
      if (gifCache[k]) return gifCache[k];
      const f = GIF_LIST.find(x => x.toLowerCase() === k || x.toLowerCase().replace(/\.gif$/, "") === k);
      return gifCache[k] = f ? GIF_BASE + f : null;
    }

    const MEME_MAP = {
      "m-no": "https://qu.ax/STWv.mp4",
      "m-que": "https://qu.ax/WpYf.mp4",
      "m-si": "https://qu.ax/pGis.mp4",
      "m-cry": "https://qu.ax/mScl.mp4",
      "m-bye": "https://qu.ax/NlCH.mp4"
    };

    const ytRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)[\w-]+[^ \n]*)/i;

    function processNode(node) {
      if (!node || node.nodeType !== 3) return;

      const text = node.nodeValue;
      if (!text || text.length < 3) return;

      const parent = node.parentNode;
      if (!parent || parent.tagName === "TEXTAREA" || parent.tagName === "INPUT" || parent.isContentEditable) return;

      if (parent.dataset && parent.dataset.mfProcessed) return;

      let modified = false;
      const frags = [];
      let remaining = text;

      while (remaining.length > 0) {
        const ytMatch = remaining.match(ytRegex);
        const gifMatch = remaining.match(/:([\w\d\-]+?)(?:\.gif)?:/i);
        const memeMatch = Object.keys(MEME_MAP).find(k => {
          const clean = k.replace(/-/g, "").replace(/:/g, "");
          return remaining.toLowerCase().replace(/-/g, "").replace(/:/g, "").includes(clean);
        });

        if (gifMatch && (!ytMatch || gifMatch.index <= ytMatch.index) && (!memeMatch || remaining.indexOf(gifMatch[0]) <= remaining.indexOf(memeMatch))) {
          if (gifMatch.index > 0) frags.push({ type: "text", value: remaining.substring(0, gifMatch.index) });
          const path = getGif(gifMatch[1]);
          if (path) {
            frags.push({ type: "gif", value: path, name: gifMatch[1] });
            modified = true;
          } else {
            frags.push({ type: "text", value: gifMatch[0] });
          }
          remaining = remaining.substring(gifMatch.index + gifMatch[0].length);
        } else if (ytMatch && (!memeMatch || ytMatch.index <= remaining.indexOf(memeMatch))) {
          if (ytMatch.index > 0) frags.push({ type: "text", value: remaining.substring(0, ytMatch.index) });
          let id = "";
          const url = ytMatch[1];
          if (url.includes("shorts/")) id = url.split("shorts/")[1].split(/[?#]/)[0];
          else if (url.includes("watch?v=")) id = url.split("watch?v=")[1].split(/[&?#]/)[0];
          else if (url.includes("youtu.be/")) id = url.split("youtu.be/")[1].split(/[?#]/)[0];
          else if (url.includes("embed/")) id = url.split("embed/")[1].split(/[?#]/)[0];
          if (id) {
            frags.push({ type: "yt", value: id });
            modified = true;
          } else {
            frags.push({ type: "text", value: ytMatch[0] });
          }
          remaining = remaining.substring(ytMatch.index + ytMatch[0].length);
        } else if (memeMatch) {
          const idx = remaining.toLowerCase().replace(/-/g, "").replace(/:/g, "").indexOf(memeMatch.replace(/-/g, "").replace(/:/g, ""));
          const realIdx = findRealIndex(remaining, memeMatch);
          if (realIdx > 0) frags.push({ type: "text", value: remaining.substring(0, realIdx) });
          frags.push({ type: "meme", value: MEME_MAP[memeMatch] });
          modified = true;
          remaining = remaining.substring(realIdx + memeMatch.length);
        } else {
          frags.push({ type: "text", value: remaining });
          remaining = "";
        }
      }

      if (modified) {
        parent.dataset.mfProcessed = "1";
        const span = document.createElement("span");
        frags.forEach(f => {
          if (f.type === "text" && f.value) {
            span.appendChild(document.createTextNode(f.value));
          } else if (f.type === "gif") {
            const img = document.createElement("img");
            img.src = f.value;
            img.className = "chat-gif";
            img.alt = f.name;
            img.title = f.name;
            span.appendChild(img);
          } else if (f.type === "yt") {
            const div = document.createElement("div");
            div.className = "yt-wrapper";
            div.innerHTML = `<iframe width="100%" height="180" src="https://www.youtube.com/embed/${f.value}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
            span.appendChild(div);
          } else if (f.type === "meme") {
            const div = document.createElement("div");
            div.className = "chat-meme-wrapper";
            div.innerHTML = `<video src="${f.value}" style="max-width:240px;border-radius:8px;" autoplay controls></video>`;
            span.appendChild(div);
          }
        });
        parent.replaceChild(span, node);
      }
    }

    function findRealIndex(text, trigger) {
      let textIdx = 0;
      let triggerIdx = 0;
      const cleanTrigger = trigger.replace(/-/g, "").replace(/:/g, "");
      const lowerText = text.toLowerCase().replace(/-/g, "").replace(/:/g, "");
      const cleanIdx = lowerText.indexOf(cleanTrigger);
      let count = 0;
      for (let i = 0; i < text.length && count < cleanIdx; i++) {
        const ch = text[i].toLowerCase();
        if (ch !== "-" && ch !== ":") count++;
        textIdx = i + 1;
      }
      return textIdx;
    }

    function scan(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        processNode(node);
      } else if (node.nodeType === 1 && node.tagName !== "SCRIPT" && node.tagName !== "STYLE") {
        if (node.dataset && node.dataset.mfProcessed) return;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let c;
        while ((c = walker.nextNode())) nodes.push(c);
        nodes.forEach(x => processNode(x));
      }
    }

    const obs = new MutationObserver(ms => {
      ms.forEach(m => {
        if (m.type === "childList") {
          m.addedNodes.forEach(n => scan(n));
        } else if (m.type === "characterData") {
          scan(m.target);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log("[MiniFeather] Chat features loaded (GIFs + Memes + YouTube)");
  }

  function update() {
    if (settings.rebrand) {
      changeTitle();
      changeFavicon();
      replaceLogo();
      replaceBackground();
      if (settings.discord) {
        replaceDiscordInput();
        hideDiscordImage();
        changeDiscordButton();
        changeDiscordDescriptions();
        changeWelcomeText();
      }
    }
    if (!settings.supportAds) blockAds();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    injectFont();
    initFPSCounter();
    initKeystrokes();
    initGUI();
    initChatFeatures();
    hookClipboard();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    update();
    console.log("[MiniFeather] Client loaded v3.0");
  }
})();
