/* ===========================================================
   NeoKaizen — scroll story engine
   Timing lives here. Text lives in data/scroll.json.
   =========================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const scroller = $('scroller');
  if (!scroller) return;

  const stage   = $('stage');
  const viewA   = $('viewA');
  const black   = $('black');
  const lens    = $('lens');
  const lensbl  = $('lensbl');
  const hole    = $('hole');
  const brand   = $('brand');
  const navmenu = $('navmenu');
  const barBg   = $('topbar-bg');
  const outro   = $('outro');
  const capH    = document.querySelector('#story-cap h2');
  const capP    = document.querySelector('#story-cap p');
  const tagEl   = $('story-tag');
  const capS    = document.querySelector('#story-cap .cap-service');
  const modeEl  = $('story-mode');

  const F = (k) => $('f-' + k);

  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sg = (p, a, b) => cl((p - a) / (b - a));
  const ss = (p, a, b) => { const t = sg(p, a, b); return t * t * (3 - 2 * t); };

  /* ---- how long the intro takes to dock, in % of total scroll ---- */
  const INTRO_END = 3.5;

  /* ---- frame fade-in ranges, 0–100 across the story ---- */
  const FADE = {
    render:   [10, 20],
    brille1:  [24, 25.5], brille2: [26, 31], brille3: [31, 36],
    raum:     [36, 42],
    varSofa:  [42, 47], varBoden: [47, 52], varWand: [52, 57], varKueche: [57, 62],
    winter:   [76, 81], nacht:    [81, 86],
    tablet:   [89, 91], garten:   [91, 94], restaurant: [94, 97], buero: [97, 100]
  };

  /* ---- lens opening width (press [ and ] to tune, value logs to console) ---- */
  let LW = 1300;                       // 700 = enge Röhre · 1560 = schmaler Rand
  const maskBg = $('mask-bg'), lensBg = $('lens-bg'), softBlur = $('softblur');

  function setLens() {
    // viewBox exactly matches the stage in pixels -> no stretching on any screen
    const r = stage.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width));
    const H = Math.max(1, Math.round(r.height));
    lens.setAttribute('viewBox', `0 0 ${W} ${H}`);
    [maskBg, lensBg].forEach(el => {
      el.setAttribute('width', W); el.setAttribute('height', H);
    });

    const k  = LW / 1600;                       // how much of the frame stays open
    const ow = W * k, oh = H * k;
    const rad = Math.min(W, H) * 0.30;
    hole.setAttribute('x', (W - ow) / 2);  hole.setAttribute('y', (H - oh) / 2);
    hole.setAttribute('width', ow);        hole.setAttribute('height', oh);
    hole.setAttribute('rx', rad);          hole.setAttribute('ry', rad);
    softBlur.setAttribute('stdDeviation', Math.max(10, Math.min(W, H) * 0.035));
  }
  setLens();
  addEventListener('resize', setLens);
  addEventListener('orientationchange', () => setTimeout(setLens, 200));
  addEventListener('keydown', (e) => {
    if (e.key !== '[' && e.key !== ']') return;
    LW = e.key === '[' ? Math.max(700, LW - 40) : Math.min(1560, LW + 40);
    setLens(); console.log('lens', LW);
  });

  /* ---- measure brand + nav so we can interpolate their positions ---- */
  let m = {};
  function measure() {
    brand.style.transform = 'none';
    navmenu.style.transform = 'none';
    const b = brand.getBoundingClientRect();
    const n = navmenu.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const small = vw < 700;
    m = {
      bw: b.width, bh: b.height, nw: n.width, nh: n.height,
      vw, vh, small,
      pad: small ? 16 : 40,
      dockScale: small ? 0.60 : 0.42
    };
  }
  measure();
  addEventListener('resize', () => { measure(); setLens(); });

  /* beim Neuladen immer oben starten */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  addEventListener('load', () => scrollTo(0, 0));
  scrollTo(0, 0);

  function dock(t) {
    // brand: centred above the middle  ->  top-left of the bar
    const bx0 = (m.vw - m.bw) / 2,           by0 = m.vh * 0.42;
    const bx1 = m.pad,                        by1 = m.small ? 22 : 26;
    const bs  = 1 + (m.dockScale - 1) * t;
    brand.style.transform =
      `translate(${bx0 + (bx1 - bx0) * t}px, ${by0 + (by1 - by0) * t}px) scale(${bs})`;

    // nav: centred under the brand  ->  right side of the bar
    const nx0 = (m.vw - m.nw) / 2,           ny0 = m.vh * 0.42 + m.bh + 34;
    // Handy: Menü rutscht auf eine eigene Zeile unter den Namen
    const nx1 = m.small ? Math.max(m.pad, (m.vw - m.nw) / 2) : m.vw - m.nw - m.pad;
    const ny1 = m.small ? 56 : 34;
    navmenu.style.transform =
      `translate(${nx0 + (nx1 - nx0) * t}px, ${ny0 + (ny1 - ny0) * t}px)`;

    barBg.style.opacity = t;
  }

  function frame() {
    const max = scroller.offsetHeight - innerHeight;
    const raw = cl(scrollY / max) * 100;

    /* intro docking */
    const t = ss(raw, 0, INTRO_END);
    dock(t);

    /* story progress, remapped so it starts after the intro */
    const p = cl((raw - INTRO_END) / (100 - INTRO_END)) * 100;

    for (const k in FADE) {
      const el = F(k); if (!el) continue;
      el.style.opacity = ss(p, FADE[k][0], FADE[k][1]);
    }

    /* headset lifted -> raw shell revealed, then back */
    const off = ss(p, 62, 68) - ss(p, 74, 76);
    const rb = F('rohbau'); if (rb) rb.style.opacity = off;

    /* lens optics: headset act, off for the tablet shot, on again outdoors */
    const vr = Math.max(ss(p, 36, 42) - ss(p, 86, 88), ss(p, 91, 93)) * (1 - off);
    lens.style.opacity = vr;
    lensbl.style.opacity = vr * 0.85;

    /* zoom into the model, reset behind the black wipe */
    viewA.style.transform = `scale(${p < 24.5 ? 1 + 0.85 * ss(p, 20, 23.5) : 1})`;

    /* black: intro cover, model wipe, cut before the tablet shot */
    const intro  = 1 - ss(raw, 1.2, INTRO_END);
    const wipe1  = Math.min(ss(p, 21, 23.5), 1 - ss(p, 25.5, 27.5));
    const wipe2  = Math.min(ss(p, 86, 88),   1 - ss(p, 89, 90.5));
    black.style.opacity = Math.max(intro, wipe1, wipe2);

    /* closing line over the last frame */
    outro.style.opacity = ss(p, 99, 100);

    /* caption: explicit ranges from data/scroll.json */
    let cur = null;
    for (const c of window.NKD_CAPTIONS) {
      if (p >= c.from && p < c.to) { cur = c; break; }
    }
    const title = cur ? cur.title : '';
    if (capH.textContent !== title) {
      capH.textContent = title;
      capP.textContent = cur ? (cur.sub || '') : '';
      tagEl.textContent = cur ? (cur.tag || '') : '';
      const svc = cur ? (cur.service || '') : '';
      capS.textContent = svc;
      capS.style.display = svc ? 'inline-block' : 'none';
      modeEl.textContent = cur ? (cur.mode || '') : '';
    }
    const showCap = (t > 0.9 && title) ? 1 : 0;
    capH.parentElement.style.opacity = showCap;
    tagEl.style.opacity = showCap * 0.5;
    modeEl.style.opacity = (showCap && modeEl.textContent) ? 1 : 0;

    requestAnimationFrame(frame);
  }
  frame();
})();
