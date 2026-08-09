<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { examsApi } from '../api';

const router = useRouter();
const exams = ref([]);
const loading = ref(true);
const error = ref('');

const deleteDialog = ref(false);
const examToDelete = ref(null);
const deleting = ref(false);
const deleteError = ref('');

onMounted(load);

async function load() {
  loading.value = true;
  try {
    exams.value = await examsApi.list();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load exams.';
  } finally {
    loading.value = false;
  }
}

function confirmDelete(exam) {
  examToDelete.value = exam;
  deleteError.value = '';
  deleteDialog.value = true;
}

async function deleteExam() {
  if (!examToDelete.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await examsApi.remove(examToDelete.value._id);
    exams.value = exams.value.filter((e) => e._id !== examToDelete.value._id);
    deleteDialog.value = false;
    examToDelete.value = null;
  } catch (err) {
    deleteError.value = err.response?.data?.message || 'Could not delete exam.';
  } finally {
    deleting.value = false;
  }
}

function statusColor(status) {
  return { draft: 'default', scheduled: 'warning', active: 'success', closed: 'default' }[status] || 'default';
}

function openExam(id) {
  router.push(`/exams/${id}`);
}
</script>

<template>
  <div class="d-flex align-center justify-space-between mb-6">
    <h1 class="text-h5 font-weight-bold">Exams</h1>
    <v-btn color="primary" prepend-icon="mdi-plus" to="/exams/new">New exam</v-btn>
  </div>

  <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
  <v-alert v-else-if="error" type="error" variant="tonal">{{ error }}</v-alert>
  <v-alert v-else-if="exams.length === 0" type="info" variant="tonal">
    No exams yet. Create your first one.
  </v-alert>

  <v-row v-else>
    <v-col v-for="exam in exams" :key="exam._id" cols="12" sm="6" md="4">
      <v-card hover class="pa-2" @click="openExam(exam._id)">
        <v-card-item>
          <template #append>
            <span class="text-caption text-medium-emphasis">{{ exam.totalMarks }} marks</span>
          </template>
          <v-chip :color="statusColor(exam.status)" size="small" variant="tonal" class="mb-2">
            {{ exam.status }}
          </v-chip>
          <div class="text-subtitle-1 font-weight-bold">{{ exam.title }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ exam.questions.length }} questions · {{ exam.durationMinutes }} min
          </div>
        </v-card-item>
        <v-card-actions>
          <v-btn
            variant="text"
            size="small"
            color="primary"
            :to="`/exams/${exam._id}/candidates`"
            @click.stop
          >
            View candidates
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            color="error"
            icon="mdi-delete-outline"
            @click.stop="confirmDelete(exam)"
          />
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>

  <v-dialog v-model="deleteDialog" max-width="480" persistent>
    <v-card>
      <v-card-title class="text-h6">Delete exam?</v-card-title>
      <v-card-text>
        <p>
          This permanently deletes <strong>{{ examToDelete?.title }}</strong> along with every
          invited candidate, their submissions, and any recorded proctoring footage for this
          exam. Questions in the question bank are not affected. This cannot be undone.
        </p>
        <v-alert v-if="deleteError" type="error" variant="tonal" class="mt-3">{{ deleteError }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="deleting" @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" :loading="deleting" @click="deleteExam">Delete exam</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
