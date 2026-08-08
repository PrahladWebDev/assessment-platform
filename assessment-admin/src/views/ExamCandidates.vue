<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { examsApi, recordingsApi, submissionsApi } from '../api';
import { getSocket, joinExamRoom, leaveExamRoom } from '../api/socket';

const props = defineProps({ id: { type: String, required: true } });

const exam = ref(null);
const candidates = ref([]);
const submissionsByCandidate = ref({});
const loading = ref(true);
const downloadingXlsx = ref(false);
const downloadingPdf = ref(false);
const tab = ref('candidates');

const openRecordings = ref(null); // candidateId currently expanded
const recordings = ref([]);
const loadingRecordings = ref(false);

// Live "is recording actually happening right now" — separate from the uploaded
// Recording segments shown in the expandable panel below. Driven by heartbeats the
// candidate app sends every ~10s (see useProctoring.js); a heartbeat older than
// STALE_MS means the stream likely dropped without the candidate app detecting it yet.
const STALE_MS = 25_000;
const now = ref(Date.now());
let recordingClockId = null;

// Question-level analysis
const questionAnalysis = ref([]);
const loadingAnalysis = ref(false);
const analysisLoaded = ref(false);

// Manual grading dialog
const gradeDialog = ref(false);
const gradingCandidate = ref(null);
const gradingSubmission = ref(null);
const loadingSubmission = ref(false);
const savingAnswerFor = ref(null);
const gradeDraft = ref({}); // questionId -> { marksAwarded, feedback }

const headers = [
  { title: 'Candidate', key: 'name' },
  { title: 'Status', key: 'status' },
  { title: 'Recording', key: 'recording', sortable: false },
  { title: 'Score', key: 'score', sortable: false },
  { title: 'Violations', key: 'violationCount', align: 'end' },
  { title: '', key: 'actions', align: 'end', sortable: false },
];

const analysisHeaders = [
  { title: 'Question', key: 'title' },
  { title: 'Type', key: 'type' },
  { title: 'Attempts', key: 'attempts', align: 'end' },
  { title: 'Pass rate', key: 'passRate', align: 'end' },
  { title: 'Avg marks', key: 'avgMarksAwarded', align: 'end' },
  { title: 'Needs grading', key: 'needsManualGrading', align: 'end' },
];

onMounted(async () => {
  await load();
  // Live progress: join this exam's room and merge incoming events into local state so
  // the table updates in real time instead of only on page load.
  joinExamRoom(props.id);
  getSocket().on('candidate-update', onCandidateUpdate);
  // Recording heartbeats stop arriving if a candidate's tab dies mid-exam; without a
  // clock tick nothing would ever move a stale-but-still-flagged-active status to
  // "stalled" until the next event came in. Re-evaluate every few seconds instead.
  recordingClockId = setInterval(() => (now.value = Date.now()), 5000);
});

onBeforeUnmount(() => {
  leaveExamRoom(props.id);
  getSocket().off('candidate-update', onCandidateUpdate);
  if (recordingClockId) clearInterval(recordingClockId);
});

function onCandidateUpdate(evt) {
  if (evt.examId !== props.id) return;
  const candidate = candidates.value.find((c) => c._id === evt.candidateId);
  if (!candidate) return;

  if (evt.kind === 'status' || evt.kind === 'progress' || evt.kind === 'submitted') {
    if (evt.status) candidate.status = evt.status;
  }
  if (evt.kind === 'violation') {
    candidate.violationCount = evt.violationCount;
  }
  if (evt.kind === 'recording') {
    candidate.recording = {
      webcamActive: evt.webcamActive,
      screenActive: evt.screenActive,
      lastHeartbeatAt: evt.lastHeartbeatAt,
    };
  }
  if (evt.kind === 'submitted' || evt.kind === 'graded') {
    const row = submissionsByCandidate.value[candidate.email];
    if (row && evt.totalMarksAwarded !== undefined) {
      row.marksAwarded = evt.totalMarksAwarded;
      row.percentage = row.marksPossible ? Math.round((evt.totalMarksAwarded / row.marksPossible) * 1000) / 10 : 0;
    }
  }
  // Question-analysis numbers go stale on any submission/grading change — just mark for
  // a refetch next time the tab is opened rather than trying to patch aggregates live.
  if (['submitted', 'graded'].includes(evt.kind)) analysisLoaded.value = false;
}

async function load() {
  loading.value = true;
  const [examData, candidateList, report] = await Promise.all([
    examsApi.get(props.id),
    examsApi.listCandidates(props.id),
    examsApi.reportData(props.id),
  ]);
  exam.value = examData;
  candidates.value = candidateList;
  submissionsByCandidate.value = Object.fromEntries(report.rows.map((r) => [r.email, r]));
  loading.value = false;
}

async function loadAnalysis() {
  loadingAnalysis.value = true;
  try {
    const res = await examsApi.questionAnalysis(props.id);
    questionAnalysis.value = res.questions;
    analysisLoaded.value = true;
  } finally {
    loadingAnalysis.value = false;
  }
}

function onTabChange(val) {
  if (val === 'analysis' && !analysisLoaded.value) loadAnalysis();
}

function scoreFor(candidate) {
  const row = submissionsByCandidate.value[candidate.email];
  if (!row || row.marksPossible === 0) return '—';
  return `${row.marksAwarded} / ${row.marksPossible} (${row.percentage}%)`;
}

async function downloadXlsx() {
  downloadingXlsx.value = true;
  try {
    await examsApi.downloadReportXlsx(props.id, `${exam.value.title}-report.xlsx`);
  } finally {
    downloadingXlsx.value = false;
  }
}

async function downloadPdf() {
  downloadingPdf.value = true;
  try {
    await examsApi.downloadReportPdf(props.id, `${exam.value.title}-report.pdf`);
  } finally {
    downloadingPdf.value = false;
  }
}

async function toggleRecordings(candidateId) {
  if (openRecordings.value === candidateId) {
    openRecordings.value = null;
    return;
  }
  openRecordings.value = candidateId;
  loadingRecordings.value = true;
  recordings.value = await recordingsApi.listForCandidate(props.id, candidateId);
  loadingRecordings.value = false;
}

function statusColor(status) {
  return (
    {
      submitted: 'success',
      auto_submitted: 'warning',
      in_progress: 'primary',
      started: 'primary',
      invited: 'default',
      expired: 'error',
    }[status] || 'default'
  );
}

// Only meaningful for candidates who are actively taking a proctored exam — invited/
// submitted/expired candidates never had (or no longer need) a live stream.
function recordingStatus(candidate) {
  const p = exam.value?.proctoring;
  const required = !!(p && (p.webcam || p.screenShare));
  if (!required || !['started', 'in_progress'].includes(candidate.status)) {
    return { text: '—', color: 'default' };
  }

  const rec = candidate.recording;
  if (!rec || !rec.lastHeartbeatAt) {
    return { text: 'Not started', color: 'default' };
  }

  const ageMs = now.value - new Date(rec.lastHeartbeatAt).getTime();
  const anyActive = rec.webcamActive || rec.screenActive;

  if (ageMs > STALE_MS) {
    return { text: 'Recording stalled', color: 'error' };
  }
  if (!anyActive) {
    return { text: 'Not recording', color: 'error' };
  }
  return { text: 'Recording live', color: 'success' };
}

// -- Manual grading --

async function openGrading(candidate) {
  gradingCandidate.value = candidate;
  gradeDialog.value = true;
  gradingSubmission.value = null;
  gradeDraft.value = {};
  loadingSubmission.value = true;
  try {
    const data = await submissionsApi.get(props.id, candidate._id);
    gradingSubmission.value = data;
    for (const a of data.answers) {
      gradeDraft.value[a.question?._id] = { marksAwarded: a.marksAwarded, feedback: a.feedback || '' };
    }
  } finally {
    loadingSubmission.value = false;
  }
}

const gradableAnswers = computed(() =>
  (gradingSubmission.value?.answers || []).filter((a) => ['subjective', 'file_upload'].includes(a.type))
);
const otherAnswers = computed(() =>
  (gradingSubmission.value?.answers || []).filter((a) => !['subjective', 'file_upload'].includes(a.type))
);

async function saveGrade(answer) {
  const questionId = answer.question?._id;
  if (!questionId) return;
  savingAnswerFor.value = questionId;
  try {
    const draft = gradeDraft.value[questionId];
    const res = await submissionsApi.grade(props.id, gradingCandidate.value._id, {
      questionId,
      marksAwarded: draft.marksAwarded,
      feedback: draft.feedback,
    });
    answer.marksAwarded = res.marksAwarded;
    answer.isCorrect = res.marksAwarded >= (answer.question.marks || 0);
    answer.gradedAt = new Date().toISOString();
    answer.needsManualGrading = false;
    if (gradingSubmission.value) gradingSubmission.value.submission.totalMarksAwarded = res.totalMarksAwarded;

    const row = submissionsByCandidate.value[gradingCandidate.value.email];
    if (row) {
      row.marksAwarded = res.totalMarksAwarded;
      row.percentage = row.marksPossible ? Math.round((res.totalMarksAwarded / row.marksPossible) * 1000) / 10 : 0;
    }
  } finally {
    savingAnswerFor.value = null;
  }
}

function downloadAnswerFile(answer) {
  if (!answer.question?._id) return;
  const name = answer.fileUrl ? answer.fileUrl.split('/').pop() : 'answer-file';
  submissionsApi.downloadAnswerFile(props.id, gradingCandidate.value._id, answer.question._id, name);
}
</script>

<template>
  <p v-if="loading" class="text-medium-emphasis">Loading…</p>

  <template v-else>
    <div class="d-flex align-start justify-space-between mb-4 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">{{ exam.title }}</h1>
        <p class="text-caption text-medium-emphasis">{{ candidates.length }} candidate(s) invited</p>
      </div>
      <div class="d-flex ga-2">
        <v-btn variant="outlined" prepend-icon="mdi-file-excel-outline" :loading="downloadingXlsx" @click="downloadXlsx">
          Excel report
        </v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-file-pdf-box" :loading="downloadingPdf" @click="downloadPdf">
          PDF report
        </v-btn>
      </div>
    </div>

    <v-tabs v-model="tab" class="mb-4" @update:model-value="onTabChange">
      <v-tab value="candidates">Candidates</v-tab>
      <v-tab value="analysis">Question analysis</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="candidates">
        <v-data-table :headers="headers" :items="candidates" item-value="_id" density="comfortable">
          <template #item.name="{ item }">
            <div class="font-weight-medium">{{ item.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.email }}</div>
          </template>
          <template #item.status="{ item }">
            <v-chip size="small" :color="statusColor(item.status)" variant="tonal">
              {{ item.status.replace('_', ' ') }}
            </v-chip>
          </template>
          <template #item.recording="{ item }">
            <v-chip
              size="small"
              :color="recordingStatus(item).color"
              :variant="recordingStatus(item).text === '—' ? 'text' : 'tonal'"
            >
              {{ recordingStatus(item).text }}
            </v-chip>
          </template>
          <template #item.score="{ item }">{{ scoreFor(item) }}</template>
          <template #item.violationCount="{ item }">
            <span :class="{ 'text-error font-weight-bold': item.violationCount > 0 }">{{ item.violationCount }}</span>
          </template>
          <template #item.actions="{ item }">
            <v-btn
              size="small"
              variant="text"
              :disabled="!['submitted', 'auto_submitted'].includes(item.status)"
              @click="openGrading(item)"
            >
              Grade
            </v-btn>
            <v-btn size="small" variant="text" @click="toggleRecordings(item._id)">
              {{ openRecordings === item._id ? 'Hide recordings' : 'Recordings' }}
            </v-btn>
          </template>
        </v-data-table>

        <v-card v-if="openRecordings" class="pa-4 mt-3" variant="tonal">
          <p v-if="loadingRecordings" class="text-medium-emphasis">Loading recordings…</p>
          <p v-else-if="recordings.length === 0" class="text-medium-emphasis">No recordings uploaded.</p>
          <div v-else class="d-flex flex-column ga-2">
            <div v-for="rec in recordings" :key="rec._id" class="d-flex align-center ga-4">
              <v-chip size="small" variant="tonal" class="text-capitalize">{{ rec.type }}</v-chip>
              <span class="text-caption text-medium-emphasis">{{ new Date(rec.startedAt).toLocaleTimeString() }}</span>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-download"
                @click="recordingsApi.download(rec._id, `recording-${rec.type}-${rec._id}.webm`)"
              >
                Download
              </v-btn>
            </div>
          </div>
        </v-card>
      </v-window-item>

      <v-window-item value="analysis">
        <v-progress-linear v-if="loadingAnalysis" indeterminate color="primary" class="mb-3" />
        <p class="text-caption text-medium-emphasis mb-3">
          Per-question breakdown across every submitted candidate — spot a badly worded question (near-0% pass
          rate) or a trivial one (near-100%) at a glance.
        </p>
        <v-data-table :headers="analysisHeaders" :items="questionAnalysis" item-value="questionId" density="comfortable">
          <template #item.type="{ item }">
            <v-chip size="small" variant="tonal">{{ item.type.replace('_', ' ') }}</v-chip>
          </template>
          <template #item.passRate="{ item }">
            <span v-if="item.passRate === null">—</span>
            <span v-else :class="item.passRate < 40 ? 'text-error' : item.passRate > 85 ? 'text-success' : ''">
              {{ item.passRate }}%
            </span>
          </template>
          <template #item.needsManualGrading="{ item }">
            <span v-if="item.needsManualGrading > 0" class="text-warning font-weight-medium">
              {{ item.needsManualGrading }}
            </span>
            <span v-else>—</span>
          </template>
        </v-data-table>
      </v-window-item>
    </v-window>

    <!-- Manual grading dialog -->
    <v-dialog v-model="gradeDialog" max-width="820" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Grade — {{ gradingCandidate?.name }}</span>
          <span v-if="gradingSubmission?.submission" class="text-body-2 text-medium-emphasis">
            Total: {{ gradingSubmission.submission.totalMarksAwarded }} / {{ gradingSubmission.submission.totalMarksPossible }}
          </span>
        </v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh">
          <p v-if="loadingSubmission" class="text-medium-emphasis">Loading submission…</p>
          <template v-else-if="gradingSubmission">
            <p v-if="gradableAnswers.length === 0" class="text-medium-emphasis">
              No subjective or file-upload answers need manual grading for this candidate.
            </p>

            <v-card
              v-for="answer in gradableAnswers"
              :key="answer.question?._id"
              variant="tonal"
              class="pa-4 mb-4"
            >
              <div class="d-flex justify-space-between align-start mb-2">
                <div class="font-weight-medium">{{ answer.question?.title }}</div>
                <v-chip size="small" :color="answer.needsManualGrading ? 'warning' : 'success'" variant="tonal">
                  {{ answer.needsManualGrading ? 'Needs grading' : 'Graded' }}
                </v-chip>
              </div>
              <p class="text-body-2 text-medium-emphasis mb-2">{{ answer.question?.statement }}</p>

              <div v-if="answer.question?.expectedAnswer" class="mb-3">
                <div class="text-caption text-medium-emphasis">Model answer</div>
                <div class="text-body-2">{{ answer.question.expectedAnswer }}</div>
              </div>

              <div class="mb-3">
                <div class="text-caption text-medium-emphasis">Candidate's answer</div>
                <div v-if="answer.type === 'subjective'" class="text-body-2" style="white-space: pre-wrap">
                  {{ answer.textAnswer || '(no answer submitted)' }}
                </div>
                <v-btn
                  v-else
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-download"
                  :disabled="!answer.fileUrl"
                  @click="downloadAnswerFile(answer)"
                >
                  {{ answer.fileUrl ? 'Download submitted file' : 'No file submitted' }}
                </v-btn>
              </div>

              <div class="d-flex ga-3 align-start flex-wrap">
                <v-text-field
                  v-model.number="gradeDraft[answer.question?._id].marksAwarded"
                  type="number"
                  min="0"
                  :max="answer.question?.marks"
                  :label="`Marks (max ${answer.question?.marks})`"
                  style="max-width: 160px"
                  density="compact"
                  hide-details
                />
                <v-text-field
                  v-model="gradeDraft[answer.question?._id].feedback"
                  label="Feedback (optional)"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                />
                <v-btn
                  color="primary"
                  :loading="savingAnswerFor === answer.question?._id"
                  @click="saveGrade(answer)"
                >
                  Save
                </v-btn>
              </div>
            </v-card>

            <v-expansion-panels v-if="otherAnswers.length" class="mt-2">
              <v-expansion-panel title="Auto-graded answers">
                <template #text>
                  <div v-for="answer in otherAnswers" :key="answer.question?._id" class="d-flex justify-space-between py-1">
                    <span>{{ answer.question?.title }}</span>
                    <span class="text-medium-emphasis">{{ answer.marksAwarded }} / {{ answer.question?.marks }}</span>
                  </div>
                </template>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="gradeDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </template>
</template>
