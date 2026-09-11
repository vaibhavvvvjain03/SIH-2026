/** 
 * particles.js — High-performance cinematic ember particle system.
 * Zero lag, GPU-friendly, buttery smooth 60-120 FPS.
 */
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  const PARTICLE_COUNT = 38;
  const CONNECTION_DIST_SQ = 110 * 110;
  const particles = [];
  let mouse = { x: -999, y: -999 };

  const COLORS = [
    { r: 245, g: 158, b: 11 },   // amber
    { r: 251, g: 191, b: 36 },   // gold
    { r: 249, g: 115, b: 22 },   // orange
    { r: 217, g: 119, b: 6 },    // dark amber
    { r: 255, g: 220, b: 150 },  // white-gold
  ];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle(randomY) {
    const depth = 0.3 + Math.random() * 0.7;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x: Math.random() * W,
      y: randomY ? Math.random() * H : H + 20 + Math.random() * 60,
      size: (1.5 + Math.random() * 2.5) * depth,
      speedY: (0.3 + Math.random() * 0.6) * depth,
      speedX: (Math.random() - 0.5) * 0.3,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.008 + Math.random() * 0.012,
      driftAmp: 0.4 + Math.random() * 0.5,
      alpha: (0.3 + Math.random() * 0.5) * depth,
      color: color,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
      depth: depth,
    };
  }

  function init() {
    resize();
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(true));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw connecting lines with squared distance check
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < CONNECTION_DIST_SQ) {
          const ratio = 1 - Math.sqrt(distSq) / 110;
          const opacity = ratio * 0.12 * Math.min(a.depth, b.depth);
          ctx.strokeStyle = `rgba(245, 158, 11, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw embers
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Physics update
      p.drift += p.driftSpeed;
      p.pulse += p.pulseSpeed;
      p.x += p.speedX + Math.sin(p.drift) * p.driftAmp;
      p.y -= p.speedY;

      // Wrap around
      if (p.y < -20) {
        p.y = H + 20;
        p.x = Math.random() * W;
      }
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;

      const currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
      const c = p.color;

      // Outer soft glow
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${currentAlpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Core bright dot
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${currentAlpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  // Passive mouse tracking
  let mouseMoveTicking = false;
  document.addEventListener('mousemove', (e) => {
    if (!mouseMoveTicking) {
      requestAnimationFrame(() => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouseMoveTicking = false;
      });
      mouseMoveTicking = true;
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    mouse.x = -999;
    mouse.y = -999;
  });

  window.addEventListener('resize', resize, { passive: true });
  init();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const p of particles) {
      const c = p.color;
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    draw();
  }
})();
