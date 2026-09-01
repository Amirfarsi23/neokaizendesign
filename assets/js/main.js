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
