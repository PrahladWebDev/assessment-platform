import { createRouter, createWebHistory } from 'vue-router';
import { authState } from '../api/client';

import Login from '../views/Login.vue';
import Dashboard from '../views/Dashboard.vue';
import QuestionBank from '../views/QuestionBank.vue';
import QuestionEditor from '../views/QuestionEditor.vue';
import BulkImport from '../views/BulkImport.vue';
import ExamEditor from '../views/ExamEditor.vue';
import ExamCandidates from '../views/ExamCandidates.vue';

const routes = [
  { path: '/login', name: 'login', component: Login, meta: { public: true } },
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/questions', name: 'questions', component: QuestionBank },
  { path: '/questions/new', name: 'question-new', component: QuestionEditor },
  { path: '/questions/:id', name: 'question-edit', component: QuestionEditor, props: true },
  { path: '/questions/import', name: 'bulk-import', component: BulkImport },
  { path: '/exams/new', name: 'exam-new', component: ExamEditor },
  { path: '/exams/:id', name: 'exam-edit', component: ExamEditor, props: true },
  { path: '/exams/:id/candidates', name: 'exam-candidates', component: ExamCandidates, props: true },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (!to.meta.public && !authState.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && authState.token) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
