<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import examApi from '../api/examApi';

// monaco-editor is loaded here instead of a plain <textarea> so candidates get real
// syntax highlighting, bracket matching, and autocomplete for the languages the
// question allows — the "styled textarea" trade-off flagged in the README.
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new JsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
      if (label === 'typescript' || label === 'javascript') return new TsWorker();
      return new EditorWorker();
    },
  };
}

// Maps our compiler-service language keys to Monaco's built-in language ids for
// highlighting/autocomplete. Unrecognized languages still work, just as plain text.
const MONACO_LANGUAGE_MAP = {
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
  nodejs: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  csharp: 'csharp',
  'c#': 'csharp',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  kotlin: 'kotlin',
  swift: 'swift',
};

const props = defineProps({
  token: { type: String, required: true },
  question: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({ code: '', language: '' }) },
});
const emit = defineEmits(['update:modelValue']);

const languages = computed(() => props.question.starterCode.map((s) => s.language));

const language = ref(
  props.modelValue.language || props.question.allowedLanguages?.[0] || languages.value[0] || ''
);
const code = ref(props.modelValue.code || starterFor(language.value));

function starterFor(lang) {
  const entry = props.question.starterCode.find((s) => s.language === lang);
  return entry?.code || '';
}

function monacoLangFor(lang) {
  return MONACO_LANGUAGE_MAP[(lang || '').toLowerCase()] || 'plaintext';
}

const editorContainer = ref(null);
let editor = null;
const editorReady = shallowRef(false);

onMounted(() => {
  editor = monaco.editor.create(editorContainer.value, {
    value: code.value,
    language: monacoLangFor(language.value),
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 2,
    scrollBeyondLastLine: false,
    // Proctoring: candidates can still select/copy their own code, but this keeps
    // paste-from-outside visible to the copy_paste violation listener in useProctoring
    // (which hooks the native document 'paste' event, unaffected by Monaco's own editing).
  });
  editor.onDidChangeModelContent(() => {
    code.value = editor.getValue();
  });
  editorReady.value = true;
});

onBeforeUnmount(() => {
  editor?.dispose();
});

// Switching language swaps in that language's starter template, but only if the
// candidate hasn't typed anything yet — never silently discard written code.
function onLanguageChange(lang) {
  if (!code.value.trim() || code.value === starterFor(language.value)) {
    code.value = starterFor(lang);
    editor?.setValue(code.value);
  }
  language.value = lang;
  if (editor) monaco.editor.setModelLanguage(editor.getModel(), monacoLangFor(lang));
}

watch(
  [code, language],
  ([c, l]) => emit('update:modelValue', { code: c, language: l }),
  { immediate: true }
);

const running = ref(false);
const runResults = ref(null);
const runError = ref('');

function versionFor(lang) {
  return props.question.starterCode.find((s) => s.language === lang)?.version || 'latest';
}

async function runCode() {
  running.value = true;
  runError.value = '';
  runResults.value = null;
  try {
    const { results } = await examApi.runCode(props.token, {
      questionId: props.question._id,
      code: code.value,
      language: language.value,
      version: versionFor(language.value),
    });
    runResults.value = results;
  } catch (err) {
    runError.value = err.response?.data?.message || 'Could not run your code. Try again.';
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="coding-panel">
    <div class="toolbar">
      <select class="lang-select" :value="language" @change="onLanguageChange($event.target.value)">
        <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
      </select>
      <button class="run-btn" :disabled="running" @click="runCode">
        {{ running ? 'Running…' : 'Run code' }}
      </button>
    </div>

    <div ref="editorContainer" class="editor"></div>

    <div v-if="runError" class="run-error">{{ runError }}</div>

    <div v-if="runResults" class="results">
      <div class="results-title">Visible test cases</div>
      <div v-for="(r, i) in runResults" :key="r.testCaseId" class="result-row" :class="{ pass: r.passed, fail: !r.passed }">
        <span class="badge">{{ r.passed ? 'Passed' : 'Failed' }}</span>
        <span class="case-label">Case {{ i + 1 }}</span>
        <pre v-if="!r.passed" class="output">{{ r.stdout || r.stderr || '(no output)' }}</pre>
      </div>
      <p class="hint">Hidden test cases run when you submit the exam.</p>
    </div>
  </div>
</template>

<style scoped>
.coding-panel {
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--panel);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-raised);
}

.lang-select {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.run-btn {
  background: var(--accent);
  color: var(--ink);
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-weight: 600;
  font-size: 0.85rem;
}

.run-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.editor {
  width: 100%;
  height: 340px;
}

.run-error {
  padding: 12px 16px;
  color: var(--signal-red);
  font-size: 0.85rem;
  border-top: 1px solid var(--border);
}

.results {
  border-top: 1px solid var(--border);
  padding: 14px 16px;
}

.results-title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.result-row:last-of-type {
  border-bottom: none;
}

.badge {
  display: inline-flex;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.pass .badge {
  background: rgba(63, 182, 139, 0.15);
  color: var(--signal-green);
}

.fail .badge {
  background: rgba(232, 93, 93, 0.15);
  color: var(--signal-red);
}

.case-label {
  color: var(--text-muted);
}

.output {
  margin: 0;
  padding: 8px 10px;
  background: var(--ink);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: pre-wrap;
  color: var(--text-muted);
}

.hint {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: var(--text-faint);
}
</style>
