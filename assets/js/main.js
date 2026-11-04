/* ===========================================================
   NeoKaizen — allgemeines Verhalten
   Cursor, Navbar und Hamburger liegen jetzt in scroll.js / CSS.
   =========================================================== */

/* weicher Lichtschein folgt der Maus (optional, nur wenn vorhanden) */
const glow = document.getElementById('cursor-glow');
if (glow) {
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top  = e.clientY + 'px';
  }, { passive: true });
}

/* Abschnitte einblenden */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* Sicherheitsnetz: falls der Observer nicht greift, nach 1,5 s alles zeigen */
setTimeout(() => {
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 1.2) el.classList.add('visible');
  });
}, 1500);

/* Kontaktformular: öffnet das Mailprogramm mit vorausgefüllter Nachricht */
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = contactForm.dataset.mailto;
    const data = new FormData(contactForm);
    const name     = data.get('name')     || '';
    const email    = data.get('email')    || '';
    const leistung = data.get('leistung') || '';
    const message  = data.get('message')  || '';

    const subject = `Projektanfrage von ${name}`;
    const bodyLines = [
      leistung ? `Leistung: ${leistung}` : null,
      `E-Mail: ${email}`,
      '',
      message,
    ].filter(l => l !== null);

    const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    window.location.href = href;
  });
}

/* ===========================================================
   Menü: durch die Geschichte fliegen statt springen

   Die Abschnitte liegen hinter dem Scroller, also hinter der ganzen
   Bildfolge. Ein normaler Anker springt dorthin und der Besucher sieht nie,
   dass dazwischen etwas liegt. Stattdessen scrollen wir in fester Zeit
   dorthin: die Bilder ziehen sichtbar vorbei, und am Ende steht man am Ziel.
   =========================================================== */
(function () {
  // Read at click time: the setting can change without a reload.
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Gentle curve on purpose. A cubic ease spends the middle of the trip at
  // enormous speed, which turns the frames into a blur — the opposite of the
  // point. This one keeps the pass-through closer to an even pace.
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  let running = null;

  function flyTo(target) {
    const root = document.documentElement;
    const from = scrollY;
    const to = Math.round(target.getBoundingClientRect().top + scrollY);
    const distance = to - from;
    if (!distance) return;

    // Long hops through the story get more time, but never so much that it
    // feels like waiting; a short hop between two sections stays brisk.
    const screens = Math.abs(distance) / innerHeight;
    // Someone who asked for less motion still gets a scroll rather than a
    // jump — just a brief one. Jumping is what makes the story invisible.
    // Tuned against the shortened story: the whole page is now about eleven
    // screens, so the per-screen term has to be generous or the flight is over
    // before the frames register.
    const duration = reduced()
      ? Math.min(1800, 600 + screens * 60)
      : Math.min(3600, 1200 + screens * 120);

    // The CSS smooth-scroll would fight this animation for the same property.
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';

    const start = performance.now();
    if (running) cancelAnimationFrame(running);

    (function step(now) {
      const t = Math.min(1, (now - start) / duration);
      scrollTo(0, from + distance * easeInOut(t));
      if (t < 1) {
        running = requestAnimationFrame(step);
      } else {
        running = null;
        root.style.scrollBehavior = previous;
      }
    })(start);
  }

  addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute('href').slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;                       // "#" or a missing section

    e.preventDefault();
    history.pushState(null, '', '#' + id);     // keep the address bar honest
    flyTo(target);
  });

  // A wheel or touch during the flight means the visitor wants control back.
  for (const kind of ['wheel', 'touchstart', 'keydown']) {
    addEventListener(kind, () => {
      if (running) {
        cancelAnimationFrame(running);
        running = null;
        document.documentElement.style.scrollBehavior = '';
      }
    }, { passive: true });
  }
})();

/* ===========================================================
   Menü am Telefon

   Sechs Punkte passen nicht nebeneinander auf ein Handy, ohne auf
   Schriftgrößen zu schrumpfen, die man weder lesen noch treffen kann.
   Also: ein Knopf, ein ganzseitiges Menü, Zeilen mit 56px Höhe.
   =========================================================== */
(function () {
  const toggle = document.getElementById('nav-toggle');
  const menu   = document.getElementById('navmenu');
  if (!toggle || !menu) return;

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    // Hinter dem offenen Menü soll die Seite nicht mitwandern.
    document.body.style.overflow = open ? 'hidden' : '';
  }

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Ein angetippter Punkt schließt das Menü; den Flug dorthin
  // übernimmt der Anker-Handler weiter oben.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
  });

  // Wird aus dem Handyformat gedreht, gehört das Menü wieder in die Leiste.
  addEventListener('resize', () => {
    if (innerWidth > 700 && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
})();

/* ===========================================================
   KaizenManager: eine Schleife, die sich wie ein GIF benimmt

   Gestartet wird sie vom Browser selbst (autoplay im Markup) — das ist
   der einzige Weg, der auch dann hält, wenn ein Skript zu spät kommt
   oder der Datensparmodus dazwischenredet. Hier steht nur noch, was ein
   GIF nicht kann: anhalten, solange niemand hinsieht, und einen Knopf
   anbieten, wenn der Browser doch nicht mitspielt.
   =========================================================== */
(function () {
  const video  = document.querySelector('.mgr-player');
  if (!video) return;
  const figure = video.closest('.mgr-video');
  const button = figure.querySelector('.mgr-toggle');

  /* Weniger Bewegung heißt hier: nicht von selbst. Der Knopf bleibt,
     wer sie sehen will, tippt sie an. */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let wanted = !REDUCED;
  if (REDUCED) { video.autoplay = false; video.pause(); }

  function mark() {
    const stopped = video.paused;
    figure.classList.toggle('is-paused', stopped);
    button.setAttribute('aria-label', stopped ? 'Aufnahme abspielen' : 'Aufnahme anhalten');
  }
  const start = () => video.play().then(mark, mark);

  video.addEventListener('play', mark);
  video.addEventListener('pause', mark);
  mark();

  button.addEventListener('click', () => {
    wanted = video.paused;
    if (wanted) start(); else video.pause();
  });

  /* Außerhalb des Bildes kostet die Schleife nur Akku. */
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { if (wanted) start(); }
      else video.pause();
    }
  }, { threshold: 0.25 }).observe(video);
})();
