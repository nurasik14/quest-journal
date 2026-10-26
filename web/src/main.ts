import { mount } from 'svelte';
import App from './App.svelte';
import { registerServiceWorker } from './lib/pwa';
import './lib/theme/fonts.css';
import './lib/theme/tokens.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app missing');
mount(App, { target });
registerServiceWorker();
