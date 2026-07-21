/**
 * Haze Particle System
 * Animated glowing particles that float around the camera frame area.
 */
class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.particles = [];
    this.running = false;
    this.mouseX = -1;
    this.mouseY = -1;
    this.config = {
      count: 40,
      minSize: 1,
      maxSize: 3.5,
      speed: 0.3,
      glowSize: 12,
      color: { r: 124, g: 92, b: 191 },  // --accent: #7c5cbf
      fadeSpeed: 0.005,
      connectionDist: 150,
    };
  }

  init() {
    if (!this.canvas) return;
    this.resize();
    this.createParticles();
    this.running = true;
    this.animate();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.canvas.width = 1920;
    this.canvas.height = 1080;
  }

  createParticles() {
    this.particles = [];
    for (let i = 0; i < this.config.count; i++) {
      this.particles.push(this.createParticle());
    }
  }

  createParticle() {
    const size = this.config.minSize + Math.random() * (this.config.maxSize - this.config.minSize);
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      size,
      baseSize: size,
      vx: (Math.random() - 0.5) * this.config.speed,
      vy: (Math.random() - 0.5) * this.config.speed,
      opacity: 0.2 + Math.random() * 0.6,
      baseOpacity: 0.2 + Math.random() * 0.6,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.01 + Math.random() * 0.02,
    };
  }

  updateParticle(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.pulsePhase += p.pulseSpeed;

    // Pulsing glow
    const pulse = Math.sin(p.pulsePhase);
    p.opacity = p.baseOpacity + pulse * 0.2;
    p.size = p.baseSize + pulse * 0.5;

    // Wrap around screen
    if (p.x < -20) p.x = this.canvas.width + 20;
    if (p.x > this.canvas.width + 20) p.x = -20;
    if (p.y < -20) p.y = this.canvas.height + 20;
    if (p.y > this.canvas.height + 20) p.y = -20;
  }

  drawParticle(p) {
    const ctx = this.ctx;
    const { r, g, b } = this.config.color;

    // Outer glow
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, this.config.glowSize);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.3})`);
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
    ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
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
          const alpha = (1 - d / dist) * 0.12;
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

// Auto-init
const particleSystem = new ParticleSystem("particle-canvas");
