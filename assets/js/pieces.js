/* ===========================================================
   NeoKaizen — Fotostapel + Nach-oben-Button
   =========================================================== */
(function () {

  /* ---------- Projekte: Bilder fallen nacheinander auf den Stapel ---------- */
  const piles = document.querySelectorAll('.proj-pile');

  // a fixed pseudo-random offset per card so the pile looks hand-laid
  function jitter(i) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233)  * 12345.6789;
    return { rx: (a - Math.floor(a)) * 2 - 1, ry: (b - Math.floor(b)) * 2 - 1 };
  }

  function layout() {
    const vh = innerHeight;

    piles.forEach((pile) => {
      const imgs = pile.querySelectorAll('.pile-img');
      const n = imgs.length;
      const r = pile.getBoundingClientRect();

      // 0 when the pile enters from below, 1 when it has scrolled past the middle
      const prog = Math.min(1, Math.max(0,
        (vh * 0.92 - r.top) / (vh * 0.78 + r.height * 0.35)));

      const step = 1 / n;

      imgs.forEach((img, i) => {
        // each photo gets its own slice of the progress
        const t = Math.min(1, Math.max(0, (prog - i * step * 0.85) / step));
        const e = t * t * (3 - 2 * t);          // smoothstep
        const j = jitter(i + 1);

        // resting position on the pile
        const restRot = j.rx * 7 - 1.5;
        const restX   = j.ry * 5;
        const restY   = -i * 1.4;

        // flying in: higher, larger, tilted, transparent
        const rot = restRot + (1 - e) * (j.rx * 14 + 10);
        const x   = restX  + (1 - e) * (j.ry * 40);
        const y   = restY  + (1 - e) * 90;
        const sc  = 1 + (1 - e) * 0.16;
        const rxd = (1 - e) * 22;               // tilt back in 3D

        img.style.zIndex = 10 + i;
        img.style.opacity = e < 0.02 ? 0 : Math.min(1, e * 2.2);
        img.style.transform =
          `translate3d(${x}px, ${y}px, 0) rotateX(${rxd}deg) rotate(${rot}deg) scale(${sc})`;
      });
    });

    /* ---------- Nach-oben-Button ---------- */
    if (toTop) toTop.classList.toggle('show', scrollY > innerHeight * 1.5);
  }

  const toTop = document.getElementById('to-top');
  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }


  /* ---------- Lightbox: Klick auf den Stapel, dann weiterklicken ---------- */
  const box = document.createElement('div');
  box.id = 'lightbox';
  box.innerHTML =
    '<button class="lb-close" aria-label="Schließen">&times;</button>' +
    '<button class="lb-nav lb-prev" aria-label="Zurück">&#8249;</button>' +
    '<img class="lb-img" alt="">' +
    '<button class="lb-nav lb-next" aria-label="Weiter">&#8250;</button>' +
    '<div class="lb-count"></div>';
  document.body.appendChild(box);

  const lbImg   = box.querySelector('.lb-img');
  const lbCount = box.querySelector('.lb-count');
  let list = [], idx = 0;

  function show(i) {
    if (!list.length) return;
    idx = (i + list.length) % list.length;
    lbImg.src = list[idx];
    lbCount.textContent = (idx + 1) + ' / ' + list.length;
  }
  function open(srcs, start) {
    list = srcs; show(start);
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    box.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { lbImg.src = ''; }, 250);
  }

  piles.forEach((pile) => {
    const srcs = [...pile.querySelectorAll('.pile-img')].map(i => i.src);
    pile.addEventListener('click', (e) => {
      const clicked = e.target.classList.contains('pile-img') ? e.target.src : srcs[srcs.length - 1];
      open(srcs, Math.max(0, srcs.indexOf(clicked)));
    });
  });

  lbImg.addEventListener('click', () => show(idx + 1));            // Bild anklicken = weiter
  box.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); show(idx + 1); });
  box.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); show(idx - 1); });
  box.querySelector('.lb-close').addEventListener('click', e => { e.stopPropagation(); close(); });
  box.addEventListener('click', e => { if (e.target === box) close(); });

  addEventListener('keydown', e => {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft')  show(idx - 1);
  });

  /* ---------- YouTube-Facade: Klick lädt erst dann das Embed ---------- */
  document.querySelectorAll('.yt-facade').forEach((box) => {
    box.querySelector('.yt-play').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = box.dataset.yt;
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      iframe.title = 'YouTube video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      box.appendChild(iframe);
      box.classList.add('playing');
    });
  });

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { layout(); ticking = false; });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  layout();
})();
