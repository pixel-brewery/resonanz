import type { ThemeOverride } from '@pixel-brewery/mosaik-elements-angular';
import { resonanzTheme as theme } from '../../../../resources/themes/resonanz-soho';

/** The owner's Theme Editor export customizes Soho through its public token contract. */
export const resonanzThemeOverrides: ThemeOverride = {
  fontFamily: theme.fontFamily,
  layout: theme.layout,
  typography: theme.typography,
  scheme: theme.scheme,
  palette: theme.palette,
  elevation: theme.elevation,
  duration: theme.duration,
};
