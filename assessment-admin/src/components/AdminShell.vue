<script setup>
import { useRouter, useRoute } from 'vue-router';
import { authState, clearSession } from '../api/client';

const router = useRouter();
const route = useRoute();

const navItems = [
  { to: '/', title: 'Exams', icon: 'mdi-file-document-edit-outline' },
  { to: '/questions', title: 'Question bank', icon: 'mdi-bank-outline' },
  { to: '/questions/import', title: 'Bulk import', icon: 'mdi-tray-arrow-up' },
];

function logout() {
  clearSession();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-navigation-drawer permanent width="240">
    <div class="pa-4">
      <div class="text-h6 font-weight-bold">
        Assessment<span class="text-primary">Admin</span>
      </div>
    </div>

    <v-list nav density="comfortable">
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :active="route.path === item.to"
        rounded="lg"
      />
    </v-list>

    <template #append>
      <div class="pa-3">
        <div class="text-caption text-medium-emphasis mb-2" style="word-break: break-word">
          {{ authState.user?.name || authState.user?.email }}
        </div>
        <v-btn block variant="outlined" size="small" color="error" prepend-icon="mdi-logout" @click="logout">
          Log out
        </v-btn>
      </div>
    </template>
  </v-navigation-drawer>

  <v-main>
    <v-container fluid class="pa-8" style="max-width: 1200px">
      <slot />
    </v-container>
  </v-main>
</template>
