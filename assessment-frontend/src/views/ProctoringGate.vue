<script setup>
const props = defineProps({
  proctoring: { type: Object, required: true },
  starting: { type: Boolean, default: false },
});
const emit = defineEmits(['begin']);

const requirements = [
  { key: 'webcam', label: 'Webcam access', desc: 'Your camera will record throughout the exam.' },
  { key: 'screenShare', label: 'Screen sharing', desc: 'Your screen will be recorded throughout the exam.' },
  { key: 'fullscreenRequired', label: 'Fullscreen mode', desc: 'The exam must stay in fullscreen — exiting is logged.' },
];
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="eyebrow">Before you begin</div>
      <h1>This exam is proctored</h1>
      <ul class="reqs">
        <li v-for="r in requirements.filter((r) => proctoring[r.key])" :key="r.key">
          <span class="dot" />
          <div>
            <div class="label">{{ r.label }}</div>
            <div class="desc">{{ r.desc }}</div>
          </div>
        </li>
      </ul>
      <p class="note">
        You'll be asked to grant these permissions in your browser. Leaving fullscreen, switching
        tabs, or stopping screen share is logged as a violation
        <template v-if="proctoring.maxViolations">
          — after {{ proctoring.maxViolations }} the exam auto-submits.
        </template>
      </p>
      <button :disabled="starting" @click="emit('begin')">
        {{ starting ? 'Setting up…' : 'Grant permissions & begin' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 480px;
  padding: 40px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.eyebrow {
  font-family: var(--font-display);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--signal-amber);
  margin-bottom: 10px;
}

h1 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  margin: 0 0 24px;
}

.reqs {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reqs li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.dot {
  margin-top: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.label {
  font-weight: 600;
  font-size: 0.92rem;
}

.desc {
  color: var(--text-muted);
  font-size: 0.82rem;
  margin-top: 2px;
}

.note {
  font-size: 0.8rem;
  color: var(--text-faint);
  line-height: 1.5;
  margin: 0 0 26px;
}

button {
  width: 100%;
  padding: 13px;
  background: var(--accent);
  color: var(--ink);
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.95rem;
}

button:disabled {
  opacity: 0.6;
}
</style>
