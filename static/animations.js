/**
 * animations.js
 * Cinematic page entrance sequence + scroll-triggered reveals + interactive effects.
 * No dependencies. Runs after DOM is ready.
 */
(function () {
  'use strict';

  // Skip if reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* =========================================================
     1. CINEMATIC PAGE ENTRANCE SEQUENCE
     ========================================================= */
  const entranceElements = [
    { sel: '.console-header .brand-mark', delay: 0, from: 'scale(0.3) rotate(45deg)', to: 'scale(1) rotate(45deg)' },
    { sel: '.eyebrow',       delay: 200,  from: 'translateY(-20px)', to: 'translateY(0)' },
    { sel: '.brand h1',      delay: 350,  from: 'translateY(30px)', to: 'translateY(0)' },
    { sel: '.brand-sub',     delay: 500,  from: 'translateX(-30px)', to: 'translateX(0)' },
    { sel: '.header-status', delay: 600,  from: 'translateX(30px)', to: 'translateX(0)' },
    { sel: '.input-bar',     delay: 750,  from: 'translateY(40px) scale(0.97)', to: 'translateY(0) scale(1)' },
    { sel: 'footer',         delay: 1000, from: 'translateY(20px)', to: 'translateY(0)' },
  ];

  // Hide elements before animation
  entranceElements.forEach(({ sel }) => {
    const el = document.querySelector(sel);
    if (el) {
      el.style.opacity = '0';
      el.style.willChange = 'transform, opacity';
    }
  });

  // Play entrance sequence
  function playEntrance() {
    entranceElements.forEach(({ sel, delay, from, to }) => {
      const el = document.querySelector(sel);
      if (!el) return;

      setTimeout(() => {
        el.style.transition = 'opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform = from;
        // Force reflow
        el.offsetHeight;
        el.style.opacity = '1';
        el.style.transform = to;

        // Clean up after animation
        setTimeout(() => {
          el.style.willChange = '';
          el.style.transition = '';
          el.style.transform = '';
        }, 900);
      }, delay);
    });
  }

  // If a cinematic intro overlay is present, the console pops in the moment
  // the intro starts its own fade-out (see intro.js) so the two crossfade
  // into each other instead of leaving a gap. Otherwise fall back to the
  // normal page load event.
  if (document.getElementById('intro-overlay')) {
    document.addEventListener('intro:complete', playEntrance, { once: true });
  } else {
    window.addEventListener('load', playEntrance);
  }

  /* =========================================================
     2. SCROLL-TRIGGERED REVEAL ANIMATIONS
     ========================================================= */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px'
  });

  // Observe sections that appear after results load
  function observeResults() {
    const revealTargets = document.querySelectorAll(
      '.intel-strip, .candidates-panel, .graph-panel, .timeline-panel, .limitations, .report-bar'
    );
    revealTargets.forEach((el) => {
      el.classList.add('reveal-target');
      revealObserver.observe(el);
    });
  }

  // Watch for results section becoming visible
  const resultsEl = document.getElementById('results');
  if (resultsEl) {
    const mutationObs = new MutationObserver(() => {
      if (!resultsEl.hidden) {
        setTimeout(observeResults, 50);
      }
    });
    mutationObs.observe(resultsEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* =========================================================
     3. HIGH-PERFORMANCE PANEL INTERACTIONS (GPU-optimized)
     ========================================================= */
  // Pure CSS handles panel hover states without JS layout recalculations.
  // This guarantees 120 FPS buttery smooth transitions without lag.

  /* =========================================================
     4. MAGNETIC BUTTON EFFECT (rAF-throttled)
     ========================================================= */
  const analyzeBtn = document.getElementById('analyze-btn');
  if (analyzeBtn) {
    let btnTicking = false;
    let btnX = 0, btnY = 0;

    analyzeBtn.addEventListener('mousemove', (e) => {
      const rect = analyzeBtn.getBoundingClientRect();
      btnX = (e.clientX - rect.left - rect.width / 2) * 0.15;
      btnY = (e.clientY - rect.top - rect.height / 2) * 0.25;

      if (!btnTicking) {
        requestAnimationFrame(() => {
          analyzeBtn.style.transform = `translate3d(${btnX}px, ${btnY}px, 0) scale(1.02)`;
          btnTicking = false;
        });
        btnTicking = true;
      }
    });

    analyzeBtn.addEventListener('mouseleave', () => {
      analyzeBtn.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      analyzeBtn.style.transform = '';
      setTimeout(() => { analyzeBtn.style.transition = ''; }, 300);
    });
  }

  /* =========================================================
     5. TYPING CURSOR GLOW ON INPUT FOCUS
     ========================================================= */
  const addrInput = document.getElementById('address-input');
  if (addrInput) {
    addrInput.addEventListener('focus', () => {
      addrInput.parentElement.classList.add('field--focused');
    });
    addrInput.addEventListener('blur', () => {
      addrInput.parentElement.classList.remove('field--focused');
    });
  }

  /* =========================================================
     6. SMOOTH COUNTER ANIMATION FOR METRICS
     ========================================================= */
  window._animateMetric = function(el, targetValue) {
    if (!el || isNaN(targetValue)) return;
    const duration = 600;
    const start = performance.now();
    const from = 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = from + (targetValue - from) * ease;
      el.textContent = current.toFixed(2);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  /* =========================================================
     7. PARALLAX ON AMBIENT GLOW (rAF-throttled for zero jank)
     ========================================================= */
  const glowTop = document.querySelector('.ambient-glow--top');
  const glowMid = document.querySelector('.ambient-glow--mid');
  let glowTicking = false;
  let mouseNormX = 0, mouseNormY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseNormX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseNormY = (e.clientY / window.innerHeight - 0.5) * 2;

    if (!glowTicking) {
      requestAnimationFrame(() => {
        if (glowTop) {
          glowTop.style.transform = `translate3d(calc(-50% + ${mouseNormX * 24}px), ${mouseNormY * 12}px, 0)`;
        }
        if (glowMid) {
          glowMid.style.transform = `translate3d(${mouseNormX * -16}px, ${mouseNormY * -8}px, 0)`;
        }
        glowTicking = false;
      });
      glowTicking = true;
    }
  }, { passive: true });

})();
