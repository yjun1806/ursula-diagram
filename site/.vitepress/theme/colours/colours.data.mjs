// The colour variables for the Colours pages, read from the engine at build time. A colour without a description, or
// a description without a colour, fails the build.
import { colourRows } from './colours.mjs';

export default {
  watch: ['../../../../src/render/colors.ts', './colours.mjs'],
  load: () => colourRows(),
};
