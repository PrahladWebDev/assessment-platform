import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';

// Reuses the same "focus room" palette the app already used as CSS variables, so
// swapping the hand-rolled design system for real Vuetify components doesn't change
// the app's look.
const focusRoomDark = {
  dark: true,
  colors: {
    background: '#0d1117',
    surface: '#161b22',
    'surface-bright': '#1c2330',
    primary: '#5b8def',
    secondary: '#3a5aa8',
    error: '#e85d5d',
    warning: '#e8a33d',
    success: '#3fb68b',
    'on-background': '#e6edf3',
    'on-surface': '#e6edf3',
  },
};

export default createVuetify({
  theme: {
    defaultTheme: 'focusRoomDark',
    themes: { focusRoomDark },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
    VTextarea: { variant: 'outlined', density: 'comfortable' },
  },
});
