<script setup>
defineProps({ token: String });
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="check">✓</div>
      <h1>Submitted</h1>
      <p>Your answers have been recorded. You can close this window now.</p>
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
  text-align: center;
  max-width: 400px;
}

.check {
  width: 56px;
  height: 56px;
  margin: 0 auto 20px;
  border-radius: 50%;
  background: rgba(63, 182, 139, 0.15);
  color: var(--signal-green);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
}

h1 {
  font-family: var(--font-display);
  margin: 0 0 10px;
}

p {
  color: var(--text-muted);
}
</style>
