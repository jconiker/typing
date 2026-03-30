/**
 * KeyQuest — Main Application Logic
 *
 * Handles:
 *  - View routing (home, intro, lesson, results)
 *  - Progress persistence via localStorage
 *  - Typing engine (keydown handling, WPM, accuracy)
 *  - Home screen rendering (lesson cards, stars, locks)
 *  - Lesson intro screen
 *  - Results screen
 *  - Sound effects via Web Audio API (no external files)
 *  - PWA service worker registration
 */

'use strict';

// ================================================================
// CONSTANTS
// ================================================================

const STORAGE_KEY = 'keyquest_progress';

// Star thresholds
const STAR_1_ACCURACY = 70;   // >= 70% accuracy
const STAR_2_ACCURACY = 85;   // >= 85% accuracy
const STAR_3_ACCURACY = 95;   // >= 95% accuracy AND WPM >= target

// Encouragement messages by star count
const ENCOURAGEMENT = {
  1: [
    "Good start! Keep practicing and you'll get faster!",
    "You finished it! Practice makes perfect.",
    "Nice work getting through the lesson. Try again for more stars!"
  ],
  2: [
    "Great job! You're building real typing skills!",
    "Solid performance! One more push for that third star!",
    "Well done! Your fingers are learning the keys!"
  ],
  3: [
    "AMAZING! You nailed it! You're a typing star!",
    "PERFECT! Three stars! You are incredible!",
    "WOW! Full stars! You're becoming a typing master!"
  ]
};

// Level accent colors for the lesson screen top bar
const LEVEL_COLORS = {
  1: '#F0A500',   // gold
  2: '#4A9EFF',   // blue
  3: '#00C896',   // teal
  4: '#EC407A'    // pink
};

// ================================================================
// SOUND ENGINE — Web Audio API, no external files
// ================================================================

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch (e) {
      console.warn('[KeyQuest] Web Audio API not available:', e);
      return null;
    }
  }
  return audioCtx;
}

function playCorrectSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch (e) { /* silent fail */ }
}

function playErrorSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) { /* silent fail */ }
}

function playLessonCompleteSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    [523, 659, 784].forEach(function(freq, i) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.2);
    });
  } catch (e) { /* silent fail */ }
}

// ================================================================
// STATE
// ================================================================

let state = {
  // Current view: 'home' | 'intro' | 'lesson' | 'results'
  view: 'home',

  // Active lesson object (from LESSONS array)
  lesson: null,

  // Active exercise index within the lesson
  exerciseIndex: 0,

  // Full exercise text (string)
  exerciseText: '',

  // Current character position in exerciseText
  charIndex: 0,

  // Total keystrokes attempted (including wrong ones)
  totalKeystrokes: 0,

  // Number of wrong keystrokes (errors)
  errorCount: 0,

  // Whether a wrong key was just pressed (for shake animation)
  inError: false,

  // Timer
  startTime: null,
  timerInterval: null,

  // Results for current lesson attempt
  results: {
    wpm: 0,
    accuracy: 0,
    seconds: 0,
    stars: 0
  }
};

// ================================================================
// PROGRESS PERSISTENCE
// ================================================================

/**
 * Load progress from localStorage.
 * Returns a normalized progress object.
 */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        completedLessons: parsed.completedLessons || {},
        totalSessions: parsed.totalSessions || 0
      };
    }
  } catch (e) {
    console.warn('[KeyQuest] Could not load progress:', e);
  }
  return { completedLessons: {}, totalSessions: 0 };
}

/**
 * Save progress to localStorage.
 */
function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('[KeyQuest] Could not save progress:', e);
  }
}

/**
 * Record a lesson completion.
 * Only updates if the new result is better (more stars, or same stars + more WPM).
 */
function recordLessonCompletion(lessonId, stars, wpm, accuracy) {
  const progress = loadProgress();
  const existing = progress.completedLessons[lessonId];

  const isBetter = !existing
    || stars > existing.stars
    || (stars === existing.stars && wpm > existing.wpm);

  if (isBetter) {
    progress.completedLessons[lessonId] = {
      stars,
      wpm: Math.round(wpm),
      accuracy: Math.round(accuracy),
      completedAt: new Date().toISOString()
    };
  }

  progress.totalSessions = (progress.totalSessions || 0) + 1;
  saveProgress(progress);
}

/**
 * Check if a lesson is unlocked.
 * Lesson 1 is always unlocked. Lesson N unlocks when N-1 has stars >= 1.
 */
function isLessonUnlocked(lessonId, progress) {
  if (lessonId === 1) return true;
  const prev = progress.completedLessons[lessonId - 1];
  return !!(prev && prev.stars >= 1);
}

// ================================================================
// VIEW ROUTING
// ================================================================

const views = {
  home:    document.getElementById('view-home'),
  intro:   document.getElementById('view-intro'),
  lesson:  document.getElementById('view-lesson'),
  results: document.getElementById('view-results')
};

function showView(name) {
  Object.entries(views).forEach(function([key, el]) {
    el.classList.toggle('hidden', key !== name);
  });
  state.view = name;
}

// ================================================================
// HOME SCREEN
// ================================================================

function renderHome() {
  const progress = loadProgress();
  renderLevelSections(progress);
  renderStatsBar(progress);
  showView('home');
}

function renderLevelSections(progress) {
  const container = document.getElementById('levels-container');
  container.innerHTML = '';

  LEVELS.forEach(function(level) {
    const levelEl = document.createElement('div');
    levelEl.className = 'level-section';

    // Apply level color accent
    const color = LEVEL_COLORS[level.id] || 'var(--gold)';
    const header = document.createElement('div');
    header.className = 'level-header';
    header.innerHTML = `
      <span class="level-title" style="color:${color}">${level.title}</span>
      <span class="level-subtitle">${level.subtitle}</span>
    `;
    levelEl.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'lessons-grid';

    const lessons = getLessonsForLevel(level.id);
    lessons.forEach(function(lesson) {
      const card = createLessonCard(lesson, progress, color);
      grid.appendChild(card);
    });

    levelEl.appendChild(grid);
    container.appendChild(levelEl);
  });
}

function createLessonCard(lesson, progress, accentColor) {
  const unlocked = isLessonUnlocked(lesson.id, progress);
  const result = progress.completedLessons[lesson.id];
  const stars = result ? result.stars : 0;
  const completed = stars >= 1;

  const card = document.createElement('div');
  card.className = 'lesson-card' + (unlocked ? ' unlocked' : ' locked') + (completed ? ' completed' : '');

  // Apply level accent color to completed cards
  if (completed && accentColor) {
    card.style.borderColor = accentColor.replace(')', ', 0.4)').replace('rgb', 'rgba').replace('#', 'rgba(').replace('var(--gold)', 'rgba(240,165,0,0.4)');
  }

  // Stars row
  let starsHtml = '';
  for (let i = 1; i <= 3; i++) {
    starsHtml += `<span class="card-star ${i <= stars ? 'filled' : 'empty'}">★</span>`;
  }

  // WPM badge if completed
  const wpmBadge = (completed && result.wpm)
    ? `<span class="card-wpm">${result.wpm} WPM</span>`
    : '';

  card.innerHTML = `
    <div class="card-number">${lesson.id}</div>
    <div class="card-title">${lesson.title}</div>
    <div class="card-stars">${starsHtml}${wpmBadge}</div>
    ${!unlocked ? '<div class="card-lock">🔒</div>' : ''}
  `;

  if (unlocked) {
    card.addEventListener('click', function() { startLesson(lesson.id); });
  }

  return card;
}

function renderStatsBar(progress) {
  const completed = Object.keys(progress.completedLessons).length;
  const allResults = Object.values(progress.completedLessons);
  const bestWpm = allResults.length
    ? Math.max(...allResults.map(r => r.wpm || 0))
    : 0;
  const avgAccuracy = allResults.length
    ? Math.round(allResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / allResults.length)
    : 0;

  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-wpm').textContent = bestWpm;
  document.getElementById('stat-accuracy').textContent = allResults.length ? avgAccuracy + '%' : '—';
}

// ================================================================
// LESSON INTRO SCREEN
// ================================================================

/**
 * showLessonIntro(lessonId)
 * Populates the intro screen and shows it.
 * The "Start Lesson" button on the intro screen calls beginLesson().
 */
function showLessonIntro(lessonId) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return;

  state.lesson = lesson;

  // Level info
  const level = getLevelForLesson(lessonId);
  const levelName = level ? level.title : 'Level ' + lesson.level;
  const levelColor = LEVEL_COLORS[lesson.level] || 'var(--gold)';

  // Set level badge
  const badgeEl = document.getElementById('intro-level-badge');
  badgeEl.textContent = 'Level ' + lesson.level + ' — ' + levelName;
  badgeEl.style.background = levelColor;
  badgeEl.style.color = lesson.level >= 2 ? '#0F1923' : '#0F1923';

  // Title
  document.getElementById('intro-title').textContent = lesson.title;

  // Tip/subtitle
  const tipText = lesson.tip || 'Get ready — keep your fingers on the home row!';
  document.getElementById('intro-subtitle').textContent = tipText;
  document.getElementById('intro-tip').innerHTML =
    '<span class="intro-tip-icon">💡</span> ' + tipText;

  // Key tiles — show the keys taught in this lesson
  const keysDisplay = document.getElementById('intro-keys-display');
  keysDisplay.innerHTML = '';

  const keysToShow = lesson.keys.slice(0, 20); // cap at 20 tiles
  keysToShow.forEach(function(k) {
    const tile = document.createElement('div');
    tile.className = 'intro-key-tile';

    // Color by finger
    const fingerClass = FINGER_MAP[k] || 'finger-space';
    tile.classList.add('intro-key-tile--' + fingerClass.replace('finger-', ''));

    // Display label: numbers as-is, letters uppercase, space as "Space"
    let label = k;
    if (k === ' ') {
      label = 'Space';
      tile.classList.add('intro-key-tile--wide');
    } else if (k.length === 1 && k >= 'a' && k <= 'z') {
      label = k.toUpperCase();
    }

    tile.textContent = label;
    keysDisplay.appendChild(tile);
  });

  // Wire the "Start Lesson" button for this specific lesson
  const startBtn = document.getElementById('btn-start-lesson');
  // Remove old listener by replacing the button (simplest approach)
  const newBtn = startBtn.cloneNode(true);
  startBtn.parentNode.replaceChild(newBtn, startBtn);
  newBtn.addEventListener('click', function() {
    beginLesson(lessonId);
  });

  showView('intro');
}

/**
 * startLesson(lessonId)
 * Entry point from lesson card click — shows the intro screen first.
 */
function startLesson(lessonId) {
  showLessonIntro(lessonId);
}

/**
 * beginLesson(lessonId)
 * Actually starts the typing exercise (called from intro "Start Lesson" button).
 */
function beginLesson(lessonId) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return;

  state.lesson = lesson;
  state.exerciseIndex = 0;
  startExercise();
}

// ================================================================
// LESSON / TYPING SCREEN
// ================================================================

function startExercise() {
  const lesson = state.lesson;
  const text = lesson.exercises[state.exerciseIndex];

  state.exerciseText = text;
  state.charIndex = 0;
  state.totalKeystrokes = 0;
  state.errorCount = 0;
  state.inError = false;
  state.startTime = null;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  // Set the level accent bar color
  const levelBar = document.getElementById('lesson-level-bar');
  if (levelBar) {
    levelBar.style.background = LEVEL_COLORS[lesson.level] || 'var(--gold)';
  }

  // Render lesson UI
  document.getElementById('lesson-title').textContent = lesson.title;
  document.getElementById('lesson-exercise-counter').textContent =
    `Exercise ${state.exerciseIndex + 1} of ${lesson.exercises.length}`;

  updateProgressBar();
  renderTypingArea();
  updateStats();

  // Highlight the first key on the keyboard
  highlightKey(text[0]);

  showView('lesson');
}

/**
 * Render the typing text area with colored spans for each character.
 * Characters before charIndex are 'done', charIndex is 'current', rest are 'upcoming'.
 */
function renderTypingArea() {
  const container = document.getElementById('typing-text');
  const text = state.exerciseText;
  let html = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const display = ch === ' ' ? '&nbsp;' : ch;

    if (i < state.charIndex) {
      html += `<span class="char done">${display}</span>`;
    } else if (i === state.charIndex) {
      html += `<span class="char current" id="char-current">${display}</span>`;
    } else {
      html += `<span class="char upcoming">${display}</span>`;
    }
  }

  container.innerHTML = html;

  // Scroll current character into view
  const currentEl = document.getElementById('char-current');
  if (currentEl) {
    currentEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/**
 * Update the WPM and accuracy displays.
 */
function updateStats() {
  const elapsed = state.startTime
    ? (Date.now() - state.startTime) / 60000
    : 0;

  const wpm = elapsed > 0
    ? Math.round((state.charIndex / 5) / elapsed)
    : 0;

  const accuracy = state.totalKeystrokes > 0
    ? Math.round(((state.totalKeystrokes - state.errorCount) / state.totalKeystrokes) * 100)
    : 100;

  document.getElementById('stat-wpm-live').textContent = wpm;
  document.getElementById('stat-accuracy-live').textContent = accuracy + '%';
}

/**
 * Update the progress bar.
 */
function updateProgressBar() {
  const total = state.exerciseText.length;
  const done = state.charIndex;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${done} / ${total}`;
}

// ================================================================
// TYPING ENGINE
// ================================================================

/**
 * Main keydown handler — attached to window.
 */
function handleKeyDown(e) {
  if (state.view !== 'lesson') return;

  const text = state.exerciseText;
  const idx = state.charIndex;

  // Prevent browser shortcuts (but allow Cmd+R for reload during dev)
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
  }

  // Ignore pure modifier keys
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab',
       'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
       'Escape', 'F1', 'F2', 'F3', 'F4', 'F5'].includes(e.key)) {
    return;
  }

  // Start timer on first real keystroke
  if (!state.startTime && idx < text.length) {
    state.startTime = Date.now();
    state.timerInterval = setInterval(updateStats, 1000);
  }

  // Backspace — move back one position
  if (e.key === 'Backspace') {
    if (state.charIndex > 0) {
      state.charIndex--;
      state.inError = false;
      renderTypingArea();
      updateProgressBar();
      const nextChar = text[state.charIndex];
      if (nextChar !== undefined) {
        highlightKey(nextChar);
      }
    }
    return;
  }

  // Already at end — nothing to do
  if (idx >= text.length) return;

  const expected = text[idx];
  const typed = e.key.length === 1 ? e.key : null;

  if (typed === null) return; // Non-character key we don't handle

  state.totalKeystrokes++;

  if (typed === expected) {
    // --- CORRECT ---
    state.inError = false;
    state.charIndex++;

    playCorrectSound();
    flashKeyCorrect(expected);

    // Re-render typing area
    renderTypingArea();
    updateProgressBar();
    updateStats();

    // Highlight next key
    if (state.charIndex < text.length) {
      highlightKey(text[state.charIndex]);
    } else {
      clearHighlights();
    }

    // Check if exercise complete
    if (state.charIndex >= text.length) {
      onExerciseComplete();
    }

  } else {
    // --- WRONG ---
    state.errorCount++;
    playErrorSound();
    triggerErrorFeedback();
    updateStats();
  }
}

/**
 * Trigger visual error feedback — red flash + shake on current character.
 */
function triggerErrorFeedback() {
  const currentEl = document.getElementById('char-current');
  if (!currentEl) return;

  currentEl.classList.remove('shake'); // Reset if already shaking
  void currentEl.offsetWidth; // Force reflow to restart animation
  currentEl.classList.add('error-flash', 'shake');

  setTimeout(function() {
    if (currentEl) {
      currentEl.classList.remove('error-flash', 'shake');
    }
  }, 400);
}

/**
 * Called when the user finishes typing all characters in an exercise.
 */
function onExerciseComplete() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;

  const elapsed = state.startTime
    ? (Date.now() - state.startTime) / 60000
    : 0.01;

  const charsTyped = state.exerciseText.length;
  const wpm = Math.round((charsTyped / 5) / elapsed);
  const accuracy = state.totalKeystrokes > 0
    ? Math.round(((state.totalKeystrokes - state.errorCount) / state.totalKeystrokes) * 100)
    : 100;

  // Check if more exercises remain in this lesson
  const lesson = state.lesson;
  const hasMore = state.exerciseIndex < lesson.exercises.length - 1;

  if (hasMore) {
    // Move to next exercise after a brief pause
    setTimeout(function() {
      state.exerciseIndex++;
      startExercise();
    }, 600);
  } else {
    // All exercises done — show results
    const stars = calculateStars(accuracy, wpm, lesson.targetWPM);
    state.results = { wpm, accuracy, seconds: Math.round(elapsed * 60), stars };

    recordLessonCompletion(lesson.id, stars, wpm, accuracy);

    playLessonCompleteSound();

    setTimeout(function() {
      showResults();
    }, 500);
  }
}

/**
 * Calculate star rating.
 */
function calculateStars(accuracy, wpm, targetWPM) {
  if (accuracy >= STAR_3_ACCURACY && wpm >= targetWPM) return 3;
  if (accuracy >= STAR_2_ACCURACY) return 2;
  if (accuracy >= STAR_1_ACCURACY) return 1;
  return 0;
}

// ================================================================
// RESULTS SCREEN
// ================================================================

function showResults() {
  const { wpm, accuracy, seconds, stars } = state.results;

  // Lesson name
  document.getElementById('results-lesson-name').textContent = state.lesson.title;

  // Stats
  document.getElementById('results-wpm').textContent = wpm;
  document.getElementById('results-accuracy').textContent = accuracy + '%';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  document.getElementById('results-time').textContent =
    mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Stars — animate them lighting up in sequence
  const starEls = document.querySelectorAll('.result-star');
  starEls.forEach(function(el, i) {
    el.classList.remove('lit', 'animate-in');
    if (i < stars) {
      setTimeout(function() {
        el.classList.add('lit', 'animate-in');
      }, 300 + i * 400);
    }
  });

  // Encouragement message
  const messages = ENCOURAGEMENT[Math.max(1, stars)] || ENCOURAGEMENT[1];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  document.getElementById('results-message').textContent = msg;

  // "Next Lesson" button — show only if next lesson exists and is now unlocked
  const nextLesson = getLessonById(state.lesson.id + 1);
  const progress = loadProgress();
  const nextBtn = document.getElementById('btn-next-lesson');

  if (nextLesson && isLessonUnlocked(nextLesson.id, progress)) {
    nextBtn.classList.remove('hidden');
    nextBtn.onclick = function() { startLesson(nextLesson.id); };
  } else {
    nextBtn.classList.add('hidden');
  }

  showView('results');
}

// ================================================================
// BUTTON HANDLERS
// ================================================================

function setupButtonHandlers() {
  // Intro screen — back to home
  document.getElementById('btn-intro-back').addEventListener('click', function() {
    renderHome();
  });

  // Lesson screen — back to home
  document.getElementById('btn-back-home').addEventListener('click', function() {
    clearInterval(state.timerInterval);
    clearHighlights();
    renderHome();
  });

  // Results screen — try again
  document.getElementById('btn-try-again').addEventListener('click', function() {
    startLesson(state.lesson.id);
  });

  // Results screen — go home
  document.getElementById('btn-results-home').addEventListener('click', function() {
    renderHome();
  });

  // "Next Lesson" and "Start Lesson" are set up dynamically
}

// ================================================================
// KEYBOARD SHORTCUT GUARD
// Prevent iPad/browser from intercepting common keys during typing
// ================================================================

window.addEventListener('keydown', handleKeyDown, { passive: false });

// ================================================================
// SERVICE WORKER REGISTRATION
// ================================================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg) {
        console.log('[KeyQuest] Service worker registered:', reg.scope);
      })
      .catch(function(err) {
        console.warn('[KeyQuest] Service worker registration failed:', err);
      });
  }
}

// ================================================================
// APP BOOT
// ================================================================

function boot() {
  // Register PWA service worker
  registerServiceWorker();

  // Render the visual keyboard in the lesson view
  const keyboardContainer = document.getElementById('keyboard-container');
  renderKeyboard(keyboardContainer);

  // Wire up all static button handlers
  setupButtonHandlers();

  // Start at home screen
  renderHome();
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', boot);
