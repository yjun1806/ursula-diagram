import DefaultTheme from 'vitepress/theme-without-fonts';
import { h } from 'vue';
import { inBrowser } from 'vitepress';
import Playground from './playground/Playground.vue';
import HomeShowcase from './home/HomeShowcase.vue';
import InstallTabs from './home/InstallTabs.vue';
import TypeGrid from './home/TypeGrid.vue';
import AgentCards from './home/AgentCards.vue';
import WhyBlock from './home/WhyBlock.vue';
import SkillBlock from './home/SkillBlock.vue';
import BenchmarkBars from './compare/BenchmarkBars.vue';
import PicGrid from './compare/PicGrid.vue';
import FeatureTable from './compare/FeatureTable.vue';
import ExampleJump from './examples/ExampleJump.vue';
import ExampleTypes from './examples/ExampleTypes.vue';
import ExampleView from './examples/ExampleView.vue';
import ColourTable from './colours/ColourTable.vue';
import ZoomLayer from './zoom/ZoomLayer.vue';
import { watchLanguageChoice } from './language-choice.js';
import { watchSectionLinks } from './section-link.js';
import './theme.css';
import './custom.css';
import './section-link.css';

export default {
  extends: DefaultTheme,
  // The home page: the install command under the hero's buttons; under the hero, the time and the drawings against a
  // skill that has the model lay out the drawing, the measured case against Mermaid.js, then the input and both outputs.
  // On every page: the lightbox that enlarges a picture.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-actions-after': () => h(InstallTabs),
      'home-hero-after': () => [h(SkillBlock), h(WhyBlock), h(HomeShowcase)],
      'layout-bottom': () => h(ZoomLayer),
    }),
  enhanceApp({ app, siteData }) {
    app.component('Playground', Playground);
    app.component('TypeGrid', TypeGrid);
    app.component('AgentCards', AgentCards);
    app.component('BenchmarkBars', BenchmarkBars);
    app.component('FeatureTable', FeatureTable);
    app.component('PicGrid', PicGrid);
    app.component('ExampleJump', ExampleJump);
    app.component('ExampleTypes', ExampleTypes);
    app.component('ExampleView', ExampleView);
    app.component('ColourTable', ColourTable);
    if (inBrowser) {
      watchLanguageChoice(siteData.value.base);
      watchSectionLinks();
    }
  },
};
