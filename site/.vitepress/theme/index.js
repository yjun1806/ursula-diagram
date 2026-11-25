import DefaultTheme from 'vitepress/theme-without-fonts';
import { h } from 'vue';
import { inBrowser } from 'vitepress';
import Playground from './playground/Playground.vue';
import HomeShowcase from './home/HomeShowcase.vue';
import InstallTabs from './home/InstallTabs.vue';
import TypeGrid from './home/TypeGrid.vue';
import { watchLanguageChoice } from './language-choice.js';
import './theme.css';
import './custom.css';

export default {
  extends: DefaultTheme,
  // The home page: the install command under the hero's buttons, and the input and both outputs under the hero.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-actions-after': () => h(InstallTabs),
      'home-hero-after': () => h(HomeShowcase),
    }),
  enhanceApp({ app, siteData }) {
    app.component('Playground', Playground);
    app.component('TypeGrid', TypeGrid);
    if (inBrowser) watchLanguageChoice(siteData.value.base);
  },
};
