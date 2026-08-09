<script setup>
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { authState, clearSession } from '../api/client';

const router = useRouter();
const route = useRoute();
const { mobile } = useDisplay();

// On mobile the drawer starts closed and overlays content (temporary);
// on desktop/tablet it stays open and pushed alongside content (permanent).
const drawerOpen = ref(!mobile.value);

watch(mobile, (isMobile) => {
  drawerOpen.value = !isMobile;
});

const navItems = [
  { to: '/', title: 'Exams', icon: 'mdi-file-document-edit-outline' },
  { to: '/questions', title: 'Question bank', icon: 'mdi-bank-outline' },
  { to: '/questions/import', title: 'Bulk import', icon: 'mdi-tray-arrow-up' },
];

function onNavSelect() {
  // Auto-close the drawer after navigating on mobile so it doesn't stay
  // open over the page content.
  if (mobile.value) drawerOpen.value = false;
}

function logout() {
  clearSession();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-app-bar v-if="mobile" density="comfortable" flat>
    <v-app-bar-nav-icon @click="drawerOpen = !drawerOpen" />
    <v-app-bar-title class="text-h6 font-weight-bold">
      Assessment<span class="text-primary">Admin</span>
    </v-app-bar-title>
  </v-app-bar>

  <v-navigation-drawer
    v-model="drawerOpen"
    :permanent="!mobile"
    :temporary="mobile"
    width="240"
  >
    <div v-if="!mobile" class="pa-4">
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
        @click="onNavSelect"
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
    <v-container fluid class="pa-4 pa-sm-6 pa-md-8" style="max-width: 1200px">
      <slot />
    </v-container>
  </v-main>
</template>
