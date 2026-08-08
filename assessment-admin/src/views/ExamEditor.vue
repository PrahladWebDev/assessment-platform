<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { examsApi, questionsApi } from '../api';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const isEdit = computed(() => !!props.id);

const loading = ref(isEdit.value);
const saving = ref(false);
const error = ref('');

const statusOptions = [
  { title: 'Draft', value: 'draft' },
  { title: 'Scheduled', value: 'scheduled' },
  { title: 'Active', value: 'active' },
  { title: 'Closed', value: 'closed' },
];

const form = reactive({
  title: '',
  description: '',
  durationMinutes: 60,
  startsAt: '',
  endsAt: '',
  negativeMarking: false,
  status: 'draft',
  proctoring: { webcam: false, screenShare: false, fullscreenRequired: false, maxViolations: 3 },
});

const attachedQuestions = ref([]); // full question objects, for display
const attachedIds = computed(() => new Set(attachedQuestions.value.map((q) => q._id)));

const questionSearch = ref('');
const searchResults = ref([]);
let searchTimer;

// "Add by group" — bulk-attach every question sharing a group label in one click,
// instead of adding each one individually via the search box below.
const groups = ref([]); // [{ group, count }]
const selectedGroup = ref(null);
const addingGroup = ref(false);
const groupAddError = ref('');

const candidateSheet = ref(''); // "name,email" per line
const inviteResult = ref(null);
const inviteError = ref('');
const inviting = ref(false);

onMounted(async () => {
  if (isEdit.value) {
    const exam = await examsApi.get(props.id);
    Object.assign(form, {
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      startsAt: exam.startsAt ? toLocalInput(exam.startsAt) : '',
      endsAt: exam.endsAt ? toLocalInput(exam.endsAt) : '',
      negativeMarking: exam.negativeMarking,
      status: exam.status,
      proctoring: exam.proctoring || form.proctoring,
    });
    attachedQuestions.value = exam.questions;
    loading.value = false;
  }
  try {
    groups.value = await questionsApi.listGroups();
  } catch {
    // Non-critical — the search-and-add-one-by-one flow still works if this fails.
  }
});

function toLocalInput(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function searchQuestions() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const res = await questionsApi.list({ search: questionSearch.value, limit: 10 });
    searchResults.value = res.items;
  }, 250);
}

function addQuestion(q) {
  if (!attachedIds.value.has(q._id)) attachedQuestions.value.push(q);
}
function removeQuestion(id) {
  attachedQuestions.value = attachedQuestions.value.filter((q) => q._id !== id);
}

// Fetches every question in the selected group and attaches whichever aren't already
// on the exam — this is the "add many at once" shortcut instead of one-by-one search.
async function addGroup() {
  if (!selectedGroup.value) return;
  groupAddError.value = '';
  addingGroup.value = true;
  try {
    const res = await questionsApi.list({ group: selectedGroup.value, limit: 500 });
    let addedCount = 0;
    for (const q of res.items) {
      if (!attachedIds.value.has(q._id)) {
        attachedQuestions.value.push(q);
        addedCount += 1;
      }
    }
    if (addedCount === 0) groupAddError.value = 'All questions in that group are already attached.';
  } catch (err) {
    groupAddError.value = err.response?.data?.message || 'Could not load that group.';
  } finally {
    addingGroup.value = false;
  }
}

const totalMarks = computed(() => attachedQuestions.value.reduce((s, q) => s + (q.marks || 0), 0));

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      title: form.title,
      description: form.description,
      durationMinutes: Number(form.durationMinutes),
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      negativeMarking: form.negativeMarking,
      status: form.status,
      proctoring: {
        ...form.proctoring,
        maxViolations: Number(form.proctoring.maxViolations),
      },
    };

    let examId = props.id;
    if (isEdit.value) {
      await examsApi.update(examId, payload);
    } else {
      const created = await examsApi.create(payload);
      examId = created._id;
    }

    await examsApi.attachQuestions(examId, attachedQuestions.value.map((q) => q._id));
    router.push(`/exams/${examId}`);
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not save the exam.';
  } finally {
    saving.value = false;
  }
}

async function sendInvites() {
  const candidates = candidateSheet.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(',').map((s) => s.trim());
      return { name, email };
    })
    .filter((c) => c.name && c.email);

  if (candidates.length === 0) return;
  inviting.value = true;
  inviteError.value = '';
  try {
    inviteResult.value = await examsApi.inviteCandidates(props.id, candidates);
    candidateSheet.value = '';
  } catch (err) {
    inviteError.value = err.response?.data?.message || 'Could not invite candidates.';
  } finally {
    inviting.value = false;
  }
}

function copyLink(link) {
  const candidateBase = import.meta.env.VITE_CANDIDATE_APP_URL || 'http://localhost:5173';
  navigator.clipboard.writeText(candidateBase.replace(/\/$/, '') + link);
}
</script>

<template>
  <div class="d-flex align-center justify-space-between mb-6">
    <h1 class="text-h5 font-weight-bold">{{ isEdit ? 'Edit exam' : 'New exam' }}</h1>
    <v-btn v-if="isEdit" variant="outlined" append-icon="mdi-arrow-right" :to="`/exams/${id}/candidates`">
      View candidates
    </v-btn>
  </div>

  <v-progress-linear v-if="loading" indeterminate color="primary" />

  <v-row v-else>
    <v-col cols="12" md="8">
      <v-form @submit.prevent="save">
        <v-row>
          <v-col cols="12">
            <v-text-field v-model="form.title" label="Title" required />
          </v-col>
          <v-col cols="12">
            <v-textarea v-model="form.description" label="Description" rows="3" />
          </v-col>

          <v-col cols="12" sm="6">
            <v-text-field v-model.number="form.durationMinutes" type="number" min="1" label="Duration (minutes)" required />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select v-model="form.status" :items="statusOptions" label="Status" />
          </v-col>

          <v-col cols="12" sm="6">
            <v-text-field v-model="form.startsAt" type="datetime-local" label="Starts at (optional)" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.endsAt" type="datetime-local" label="Ends at (optional)" />
          </v-col>

          <v-col cols="12">
            <v-checkbox v-model="form.negativeMarking" label="Enable negative marking" hide-details />
          </v-col>

          <v-col cols="12">
            <v-card variant="tonal" class="pa-4">
              <div class="text-caption text-medium-emphasis mb-2">Proctoring</div>
              <v-checkbox v-model="form.proctoring.webcam" label="Require webcam recording" hide-details density="compact" />
              <v-checkbox v-model="form.proctoring.screenShare" label="Require screen recording" hide-details density="compact" />
              <v-checkbox v-model="form.proctoring.fullscreenRequired" label="Require fullscreen" hide-details density="compact" />
              <v-text-field
                v-model.number="form.proctoring.maxViolations"
                type="number"
                min="0"
                label="Max violations before auto-submit"
                style="max-width: 280px"
                class="mt-3"
              />
            </v-card>
          </v-col>

          <v-col cols="12">
            <div class="text-caption text-medium-emphasis mb-2">
              Questions ({{ attachedQuestions.length }} attached, {{ totalMarks }} total marks)
            </div>

            <v-card v-if="groups.length" variant="tonal" class="pa-3 mb-3">
              <div class="text-caption text-medium-emphasis mb-2">
                Add all questions from a group — no need to add each one individually
              </div>
              <div class="d-flex ga-3 align-center flex-wrap">
                <v-select
                  v-model="selectedGroup"
                  :items="groups.map((g) => ({ title: `${g.group} (${g.count})`, value: g.group }))"
                  label="Question group"
                  hide-details
                  density="comfortable"
                  style="max-width: 320px"
                />
                <v-btn color="primary" variant="tonal" :loading="addingGroup" :disabled="!selectedGroup" @click="addGroup">
                  Add all
                </v-btn>
              </div>
              <v-alert v-if="groupAddError" type="warning" variant="tonal" density="compact" class="mt-2">
                {{ groupAddError }}
              </v-alert>
            </v-card>

            <v-text-field
              v-model="questionSearch"
              placeholder="Or search question bank…"
              prepend-inner-icon="mdi-magnify"
              hide-details
              density="comfortable"
              @input="searchQuestions"
            />
            <v-list v-if="searchResults.length" density="compact" class="mt-2 rounded border">
              <v-list-item v-for="q in searchResults" :key="q._id">
                <template #title>{{ q.title }}</template>
                <template #subtitle>{{ q.type }} · {{ q.marks }} marks</template>
                <template #append>
                  <v-btn
                    size="small"
                    variant="tonal"
                    :disabled="attachedIds.has(q._id)"
                    @click="addQuestion(q)"
                  >
                    {{ attachedIds.has(q._id) ? 'Added' : 'Add' }}
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>

            <v-list density="compact" class="mt-3 rounded border">
              <v-list-item v-for="q in attachedQuestions" :key="q._id">
                <template #title>{{ q.title }}</template>
                <template #subtitle>{{ q.type }} · {{ q.marks }} marks</template>
                <template #append>
                  <v-btn icon="mdi-close" size="small" variant="text" color="error" @click="removeQuestion(q._id)" />
                </template>
              </v-list-item>
              <v-list-item v-if="attachedQuestions.length === 0">
                <span class="text-medium-emphasis">No questions attached yet.</span>
              </v-list-item>
            </v-list>
          </v-col>

          <v-col cols="12" v-if="error">
            <v-alert type="error" variant="tonal">{{ error }}</v-alert>
          </v-col>

          <v-col cols="12" class="d-flex ga-3">
            <v-btn variant="outlined" @click="router.push('/')">Cancel</v-btn>
            <v-btn type="submit" color="primary" :loading="saving">Save exam</v-btn>
          </v-col>
        </v-row>
      </v-form>
    </v-col>

    <v-col cols="12" md="4" v-if="isEdit">
      <v-card class="pa-5" style="position: sticky; top: 20px">
        <div class="text-subtitle-1 font-weight-bold mb-1">Invite candidates</div>
        <p class="text-caption text-medium-emphasis mb-3">
          One per line: <code>Name, email@example.com</code>
        </p>
        <v-textarea
          v-model="candidateSheet"
          rows="6"
          placeholder="Asha Rao, asha@example.com"
          hide-details
          class="mb-3"
        />
        <v-btn color="primary" block :loading="inviting" @click="sendInvites">Send invites</v-btn>
        <v-alert v-if="inviteError" type="error" variant="tonal" class="mt-3">{{ inviteError }}</v-alert>

        <v-list v-if="inviteResult" density="compact" class="mt-3">
          <v-list-item v-for="c in inviteResult.candidates" :key="c.id">
            <template #title>{{ c.name }}</template>
            <template #append>
              <v-btn size="small" variant="text" @click="copyLink(c.examLink)">Copy link</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-col>
  </v-row>
</template>
