import DefaultTheme from 'vitepress/theme-without-fonts';
import { h } from 'vue';
import { inBrowser } from 'vitepress';
import Playground from './playground/Playground.vue';
import HomeShowcase from './home/HomeShowcase.vue';
import InstallTabs from './home/InstallTabs.vue';
import TypeGrid from './home/TypeGrid.vue';
import BenchmarkBars from './compare/BenchmarkBars.vue';
import FeatureTable from './compare/FeatureTable.vue';
import ExampleJump from './examples/ExampleJump.vue';
import ExampleTypes from './examples/ExampleTypes.vue';
import ExampleView from './examples/ExampleView.vue';
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
    app.component('BenchmarkBars', BenchmarkBars);
    app.component('FeatureTable', FeatureTable);
    app.component('ExampleJump', ExampleJump);
    app.component('ExampleTypes', ExampleTypes);
    app.component('ExampleView', ExampleView);
    if (inBrowser) watchLanguageChoice(siteData.value.base);
  },
};
