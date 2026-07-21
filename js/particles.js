/**
 * Haze Effects — Bokeh ambient + border glow travel + song-change sweep
 */
class HazeEffects {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.bokehParticles = [];
    this.sweepParticles = [];
    this.running = false;
    this.cameraRect = null;
    this.glowAngle = 0;
    this.config = {
      bokeh: {
        count: 18,
        minSize: 20,
        maxSize: 55,
        minOpacity: 0.03,
        maxOpacity: 0.12,
        speed: 0.15,
      },
      color: { r: 124, g: 92, b: 191 },  // #7c5cbf
      sweepSpeed: 12,
      sweepLifespan: 60,
    };
  }

  init() {
    if (!this.canvas) return;
    this.resize();
    this.detectCamera();
    this.createBokeh();
    this.running = true;
    this.animate();
    window.addEventListener("resize", () => {
      this.resize();
      this.detectCamera();
    });
  }

  resize() {
    this.canvas.width = 1920;
    this.canvas.height = 1080;
  }

  detectCamera() {
    const cam = document.getElementById("camera");
    if (!cam) {
      this.cameraRect = { x: 1554, y: 684, w: 336, h: 336 };
      return;
    }
    const r = cam.getBoundingClientRect();
    this.cameraRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  // ── Bokeh (ambient soft circles) ───────────────────

  createBokeh() {
    this.bokehParticles = [];
    for (let i = 0; i < this.config.bokeh.count; i++) {
      this.bokehParticles.push(this.spawnBokeh());
    }
  }

  spawnBokeh() {
    const { x, y, w, h } = this.cameraRect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const cfg = this.config.bokeh;
    const size = cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize);
    const angle = Math.random() * Math.PI * 2;
    const dist = 180 + Math.random() * 200;

    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      size,
      baseOpacity: cfg.minOpacity + Math.random() * (cfg.maxOpacity - cfg.minOpacity),
      opacity: 0,
      vx: (Math.random() - 0.5) * cfg.speed,
      vy: (Math.random() - 0.5) * cfg.speed,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.005 + Math.random() * 0.01,
    };
  }

  updateBokeh(p) {
    const cfg = this.config.bokeh;
    p.x += p.vx;
    p.y += p.vy;
    p.phase += p.phaseSpeed;
    p.opacity = p.baseOpacity * (0.5 + 0.5 * Math.sin(p.phase));

    // Gentle drift — respawn if too far
    const { x, y, w, h } = this.cameraRect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (Math.hypot(p.x - cx, p.y - cy) > 450) {
      Object.assign(p, this.spawnBokeh());
    }
  }

  drawBokeh(p) {
    const ctx = this.ctx;
    const { r, g, b } = this.config.color;

    // Soft outer glow
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity})`);
    grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.4})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Sweep (burst on song change) ───────────────────

  triggerSweep() {
    const { x, y, w, h } = this.cameraRect;
    const { r, g, b } = this.config.color;
    const count = 25;

    for (let i = 0; i < count; i++) {
      // Start from a random point along the camera border
      const edge = Math.floor(Math.random() * 4);
      let sx, sy;
      switch (edge) {
        case 0: sx = x + Math.random() * w; sy = y - 10; break;
        case 1: sx = x + w + 10; sy = y + Math.random() * h; break;
        case 2: sx = x + Math.random() * w; sy = y + h + 10; break;
        case 3: sx = x - 10; sy = y + Math.random() * h; break;
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;

      this.sweepParticles.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 3,
        life: this.config.sweepLifespan,
        maxLife: this.config.sweepLifespan,
        r, g, b,
      });
    }
  }

  updateSweep(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life--;
  }

  drawSweep(p) {
    const ctx = this.ctx;
    const lifeRatio = p.life / p.maxLife;
    const alpha = lifeRatio * 0.8;
    const { r, g, b } = p;

    // Glow
    const glowSize = p.size * 4;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = `rgba(232, 230, 240, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * lifeRatio * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Animate ────────────────────────────────────────

  animate() {
    if (!this.running) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Bokeh
    for (const p of this.bokehParticles) {
      this.updateBokeh(p);
      this.drawBokeh(p);
    }

    // Sweep particles
    this.sweepParticles = this.sweepParticles.filter((p) => p.life > 0);
    for (const p of this.sweepParticles) {
      this.updateSweep(p);
      this.drawSweep(p);
    }

    requestAnimationFrame(() => this.animate());
  }

  stop() {
    this.running = false;
  }
}

const hazeEffects = new HazeEffects("particle-canvas");
