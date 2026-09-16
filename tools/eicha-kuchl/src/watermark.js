/**
 * Corner logo.
 *
 * The source artwork is black line art on transparency, which would vanish
 * against a dark scene, so it is re-tinted once onto a canvas. Keeping that
 * canvas around means the same artwork can be composited into exported renders
 * — a CSS filter on the <img> would only ever affect the screen.
 */
export class Watermark {
  /**
   * @param {object} opts { src, colour, opacity, size } — size is a fraction of
   *   the viewport width.
   */
  constructor({ src, colour = '#ffffff', opacity = 0.38, size = 0.1, margin = 0.025 } = {}) {
    this.colour = colour;
    this.opacity = opacity;
    this.size = size;
    this.margin = margin;
    this.canvas = null;
    this.enabled = true;
    this.ready = this._load(src);
  }

  async _load(src) {
    try {
      const image = await loadImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      ctx.globalCompositeOperation = 'source-in';   // keep the alpha, swap the ink
      ctx.fillStyle = this.colour;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      this.canvas = canvas;
      return canvas;
    } catch {
      return null;                                   // a missing logo is not fatal
    }
  }

  /** Point an <img> element at the tinted artwork. */
  async attach(element) {
    this.element = element;
    const canvas = await this.ready;
    if (!canvas || !element) return;
    element.src = canvas.toDataURL('image/png');
    element.style.opacity = String(this.opacity);
    element.style.width = `${this.size * 100}%`;
    this.setEnabled(this.enabled);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.element) this.element.hidden = !on;
  }

  /**
   * Draw the logo into a rendered frame, matching where it sits on screen.
   * @param {CanvasRenderingContext2D} ctx target 2D context
   */
  paint(ctx, width, height) {
    if (!this.enabled || !this.canvas) return;

    const w = width * this.size;
    const h = w * (this.canvas.height / this.canvas.width);
    const margin = width * this.margin;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(this.canvas, width - w - margin, height - h - margin, w, h);
    ctx.restore();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
