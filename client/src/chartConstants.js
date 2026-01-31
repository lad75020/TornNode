// Hauteur globale des graphiques
// Modifier cette valeur pour appliquer partout une nouvelle hauteur.
export const CHART_HEIGHT = 400;

// Marges/padding globaux appliqués (peuvent être utilisés dans options Chart.js ou wrappers)
export const CHART_MARGINS = {
	top: 8,
	right: 12,
	bottom: 12,
	left: 8,
};

// Couleurs génériques (hors palettes dynamiques dark/light gérées dans chartTheme)
// Utiliser pour éléments UI autour des charts ou fallback.
export const CHART_BASE_COLORS = {
	lightBackground: '#ffffff',
	darkBackground: '#1e1f26',
	axisLight: '#222222',
	axisDark: '#e0e0e0',
	gridLight: 'rgba(0,0,0,0.1)',
	gridDark: 'rgba(255,255,255,0.08)',
	positive: '#4caf50',
	negative: '#ef5350',
	warning: '#ffb300',
	info: '#42a5f5',
};

// Espace réservé pour ajouter d'autres constantes liées aux graphiques
export const CHART_CONSTANTS_VERSION = 1;
