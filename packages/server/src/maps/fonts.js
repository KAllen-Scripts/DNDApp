/**
 * The fonts for map labels (shared/map-design.js LABEL_FONTS): the server
 * draws a made map's labels with them, and the page loads the same files
 * (style.css @font-face) so the creator's preview matches. Both are open
 * fonts (SIL Open Font License) from the @fontsource packages.
 */
import { fileURLToPath } from 'node:url';

const file = (spec) => () => fileURLToPath(import.meta.resolve(spec));

export const LABEL_FONT_FILES = [
  { url: '/fonts/im-fell-english.woff2', family: 'IM Fell English', file: file('@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2') },
  { url: '/fonts/im-fell-english-italic.woff2', family: 'IM Fell English', file: file('@fontsource/im-fell-english/files/im-fell-english-latin-400-italic.woff2') },
  { url: '/fonts/cinzel-bold.woff2', family: 'Cinzel', file: file('@fontsource/cinzel/files/cinzel-latin-700-normal.woff2') },
];
