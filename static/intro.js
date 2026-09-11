/**
 * intro.js
 * Short cinematic intro — plays a graded bonfire clip with a title reveal,
 * dismissible by clicking/tapping anywhere, any key, or when the clip ends.
 *
 * Transition design: the moment the visitor dismisses the intro (or it ends
 * naturally), we start the overlay's fade-out AND fire `intro:complete`
 * immediately (rather than waiting for the fade to finish). animations.js
 * listens for that event and kicks off the console's entrance animation, so
 * the two overlap — a genuine crossfade instead of a black gap in between.
 */
(function () {
  'use strict';

  const overlay = document.getElementById('intro-overlay');
  if (!overlay) return;

  const video = document.getElementById('intro-video');
  const skipBtn = document.getElementById('intro-skip');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FADE_MS = 750;

  let done = false;
  let fallbackTimer = null;

  function removeOverlay() {
    document.body.classList.remove('intro-active');
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Reduced-motion visitors skip the cinematic entirely, no fade, no flash.
  function skipInstantly() {
    removeOverlay();
    document.dispatchEvent(new Event('intro:complete'));
  }

  function finish() {
    if (done) return;
    done = true;

    if (fallbackTimer) clearTimeout(fallbackTimer);
    document.removeEventListener('keydown', onKey);

    if (video) {
      try { video.pause(); } catch (e) { /* noop */ }
    }

    if (reduceMotion) {
      skipInstantly();
      return;
    }

    overlay.classList.add('intro-overlay--out');
    document.dispatchEvent(new Event('intro:complete'));
    window.setTimeout(removeOverlay, FADE_MS);
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      finish();
    }
  }

  if (reduceMotion) {
    skipInstantly();
    return;
  }

  document.body.classList.add('intro-active');

  overlay.addEventListener('click', finish);
  if (skipBtn) skipBtn.addEventListener('click', finish);
  document.addEventListener('keydown', onKey);

  if (video) {
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      // Autoplay can be blocked by the browser — the skip prompt is already
      // visible, so a blocked autoplay just means a still poster frame
      // instead of motion; nothing else needs to change.
      playPromise.catch(() => {});
    }
  } else {
    finish();
  }

  // Absolute safety net so nobody ever gets stuck behind the intro.
  fallbackTimer = window.setTimeout(finish, 12000);
})();
