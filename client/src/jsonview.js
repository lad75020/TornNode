// Small DOM-only JSON renderer. Values are assigned with textContent so previewed
// log data can never become HTML while preserving the public renderJSON API.
function typeOf(value) { return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value; }

function renderNode(key, value, depth) {
  const row = document.createElement('div'); row.className = 'line'; row.style.marginLeft = `${depth * 18}px`;
  const label = document.createElement('span'); label.className = 'json-key'; label.textContent = key;
  const isContainer = value && typeof value === 'object';
  if (!isContainer) { const output = document.createElement('span'); output.className = `json-value json-${typeOf(value)}`; output.textContent = String(value); row.append(label, document.createTextNode(': '), output); return row; }
  const button = document.createElement('button'); button.type = 'button'; button.className = 'caret-icon'; button.textContent = '▸';
  const summary = document.createElement('span'); summary.className = 'json-size'; summary.textContent = `${Array.isArray(value) ? '[' : '{'}${Object.keys(value).length}${Array.isArray(value) ? ']' : '}'}`;
  const children = document.createElement('div'); children.hidden = true;
  button.addEventListener('click', () => { children.hidden = !children.hidden; button.textContent = children.hidden ? '▸' : '▾'; });
  Object.entries(value).forEach(([childKey, childValue]) => children.appendChild(renderNode(childKey, childValue, depth + 1)));
  row.append(button, label, summary, children); return row;
}

export function renderJSON(value, container) {
  if (!container) throw new Error('Preview container is missing');
  const root = document.createElement('div'); root.className = 'json-container';
  root.appendChild(renderNode('root', value, 0)); container.appendChild(root);
  return { el: root };
}

export default { renderJSON };
