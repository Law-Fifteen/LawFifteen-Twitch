/**
 * Haze Particle System
 * Animated glowing particles that orbit around the camera frame — never inside it.
 */
class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.particles = [];
    this.running = false;
    this.cameraRect = null;
    this.config = {
      count: 35,
      minSize: 1,
      maxSize: 3,
      speed: 0.25,
      glowSize: 14,
      color: { r: 124, g: 92, b: 191 },
      connectionDist: 120,
      spawnPadding: 60,   // how far outside the camera frame particles can spawn
    };
  }

  init() {
    if (!this.canvas) return;
    this.resize();
    this.detectCamera();
    this.createParticles();
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

  /** Find the camera frame element and get its bounding rect. */
  detectCamera() {
    const cam = document.getElementById("camera");
    if (!cam) {
      // Fallback: use gameplay position
      this.cameraRect = { x: 1554, y: 684, w: 336, h: 336 };
      return;
    }
    const r = cam.getBoundingClientRect();
    this.cameraRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** Spawn a particle somewhere around the camera frame border. */
  createParticle() {
    const size = this.config.minSize + Math.random() * (this.config.maxSize - this.config.minSize);
    const { x, y, w, h } = this.cameraRect;
    const pad = this.config.spawnPadding;

    // Pick a random edge of the camera frame + padding zone
    // 0=top, 1=right, 2=bottom, 3=left
    const edge = Math.floor(Math.random() * 4);
    let px, py;

    switch (edge) {
      case 0: // top edge — above camera
        px = x - pad + Math.random() * (w + pad * 2);
        py = y - pad + Math.random() * pad;
        break;
      case 1: // right edge — right of camera
        px = x + w + Math.random() * pad;
        py = y - pad + Math.random() * (h + pad * 2);
        break;
      case 2: // bottom edge — below camera
        px = x - pad + Math.random() * (w + pad * 2);
        py = y + h + Math.random() * pad;
        break;
      case 3: // left edge — left of camera
        px = x - pad + Math.random() * pad;
        py = y - pad + Math.random() * (h + pad * 2);
        break;
    }

    return {
      x: px,
      y: py,
      size,
      baseSize: size,
      vx: (Math.random() - 0.5) * this.config.speed,
      vy: (Math.random() - 0.5) * this.config.speed,
      opacity: 0.2 + Math.random() * 0.5,
      baseOpacity: 0.2 + Math.random() * 0.5,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.008 + Math.random() * 0.015,
    };
  }

  createParticles() {
    this.particles = [];
    for (let i = 0; i < this.config.count; i++) {
      this.particles.push(this.createParticle());
    }
  }

  /** Check if a point is inside the camera frame. */
  isInsideCamera(px, py) {
    if (!this.cameraRect) return false;
    const { x, y, w, h } = this.cameraRect;
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  updateParticle(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.pulsePhase += p.pulseSpeed;

    const pulse = Math.sin(p.pulsePhase);
    p.opacity = p.baseOpacity + pulse * 0.2;
    p.size = p.baseSize + pulse * 0.4;

    // If particle drifted inside camera, push it out to nearest edge
    if (this.isInsideCamera(p.x, p.y)) {
      const { x, y, w, h } = this.cameraRect;
      const toLeft = p.x - x;
      const toRight = (x + w) - p.x;
      const toTop = p.y - y;
      const toBottom = (y + h) - p.y;
      const min = Math.min(toLeft, toRight, toTop, toBottom);

      if (min === toLeft) { p.x = x - 5; p.vx = -Math.abs(p.vx); }
      else if (min === toRight) { p.x = x + w + 5; p.vx = Math.abs(p.vx); }
      else if (min === toTop) { p.y = y - 5; p.vy = -Math.abs(p.vy); }
      else { p.y = y + h + 5; p.vy = Math.abs(p.vy); }
    }

    // Respawn if too far from camera
    const { x, y, w, h } = this.cameraRect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    if (dist > 400) {
      Object.assign(p, this.createParticle());
    }
  }

  drawParticle(p) {
    const ctx = this.ctx;
    const { r, g, b } = this.config.color;

    // Outer glow
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, this.config.glowSize);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.35})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.config.glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = `rgba(232, 230, 240, ${p.opacity * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  drawConnections() {
    const ctx = this.ctx;
    const { r, g, b } = this.config.color;
    const dist = this.config.connectionDist;

    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b2 = this.particles[j];
        const dx = a.x - b2.x;
        const dy = a.y - b2.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < dist) {
          const alpha = (1 - d / dist) * 0.1;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.stroke();
        }
      }
    }
  }

  animate() {
    if (!this.running) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawConnections();

    for (const p of this.particles) {
      this.updateParticle(p);
      this.drawParticle(p);
    }

    requestAnimationFrame(() => this.animate());
  }

  stop() {
    this.running = false;
  }
}

const particleSystem = new ParticleSystem("particle-canvas");
