<script setup>
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AdminShell from './components/AdminShell.vue';
import { authApi } from './api';
import { authState, clearSession } from './api/client';
import { connectSocket } from './api/socket';

const route = useRoute();

onMounted(async () => {
  if (authState.token && !authState.user) {
    try {
      const { user } = await authApi.me();
      authState.user = user;
    } catch {
      clearSession();
    }
  }
  if (authState.token) connectSocket();
});
</script>

<template>
  <v-app>
    <router-view v-if="route.meta.public" />
    <AdminShell v-else>
      <router-view />
    </AdminShell>
  </v-app>
</template>
