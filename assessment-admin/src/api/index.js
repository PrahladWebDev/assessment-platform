import { api } from './client';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const questionsApi = {
  list: (params) => api.get('/questions', { params }).then((r) => r.data),
  get: (id) => api.get(`/questions/${id}`).then((r) => r.data),
  create: (data) => api.post('/questions', data).then((r) => r.data),
  update: (id, data) => api.put(`/questions/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/questions/${id}`),
  listGroups: () => api.get('/questions/groups').then((r) => r.data),
  uploadMedia: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/questions/media', form).then((r) => r.data);
  },
  previewImport: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/questions/bulk-import/preview', form).then((r) => r.data);
  },
  confirmImport: (questions) =>
    api.post('/questions/bulk-import/confirm', { questions }).then((r) => r.data),
  exportQuestions: (format, filters = {}) =>
    downloadBlob('/questions/export', `question-bank-export.${format}`, { format, ...filters }),
};

export const examsApi = {
  list: () => api.get('/exams').then((r) => r.data),
  get: (id) => api.get(`/exams/${id}`).then((r) => r.data),
  create: (data) => api.post('/exams', data).then((r) => r.data),
  update: (id, data) => api.put(`/exams/${id}`, data).then((r) => r.data),
  attachQuestions: (id, questionIds) =>
    api.post(`/exams/${id}/questions`, { questionIds }).then((r) => r.data),
  inviteCandidates: (id, candidates) =>
    api.post(`/exams/${id}/candidates`, { candidates }).then((r) => r.data),
  listCandidates: (id) => api.get(`/exams/${id}/candidates`).then((r) => r.data),
  reportData: (id) => api.get(`/exams/${id}/report`).then((r) => r.data),
  questionAnalysis: (id) => api.get(`/exams/${id}/report/questions`).then((r) => r.data),
  downloadReportXlsx: (id, filename) => downloadBlob(`/exams/${id}/report/xlsx`, filename),
  downloadReportPdf: (id, filename) => downloadBlob(`/exams/${id}/report/pdf`, filename),
};

export const submissionsApi = {
  get: (examId, candidateId) =>
    api.get(`/exams/${examId}/candidates/${candidateId}/submission`).then((r) => r.data),
  grade: (examId, candidateId, { questionId, marksAwarded, feedback }) =>
    api
      .post(`/exams/${examId}/candidates/${candidateId}/submission/grade`, {
        questionId,
        marksAwarded,
        feedback,
      })
      .then((r) => r.data),
  downloadAnswerFile: (examId, candidateId, questionId, filename) =>
    downloadBlob(`/exams/${examId}/candidates/${candidateId}/submission/answers/${questionId}/download`, filename),
};

// These endpoints require the admin's Bearer token, which a plain <a href> download
// link can't attach — so we fetch as a blob through the authenticated client and
// trigger the browser's save dialog from the resulting object URL.
async function downloadBlob(path, filename, params) {
  const res = await api.get(path, { responseType: 'blob', params });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const recordingsApi = {
  listForCandidate: (examId, candidateId) =>
    api.get(`/exams/${examId}/candidates/${candidateId}/recordings`).then((r) => r.data),
  download: (id, filename) => downloadBlob(`/recordings/${id}/download`, filename),
};
