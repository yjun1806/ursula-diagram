import DefaultTheme from 'vitepress/theme-without-fonts';
import { inBrowser } from 'vitepress';
import Playground from './playground/Playground.vue';
import { watchLanguageChoice } from './language-choice.js';
import './theme.css';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app, siteData }) {
    app.component('Playground', Playground);
    if (inBrowser) watchLanguageChoice(siteData.value.base);
  },
};
