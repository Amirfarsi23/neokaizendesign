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
    const duration = Math.min(3600, 900 + screens * 60);

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
    if (reduced()) target.scrollIntoView();    // no flight for those who opted out
    else flyTo(target);
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
