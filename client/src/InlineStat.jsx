import React from 'react';

// Composant réutilisable pour afficher une valeur numérique ou texte avec label inline.
// Props:
// id: identifiant unique pour l'input
// label: texte du label
// value: valeur à afficher (null/undefined => vide)
// format: fonction optionnelle de formatage
// containerStyle, labelStyle, inputStyle: styles inline additionnels
export default function InlineStat({
  id,
  label,
  value,
  format = v => v,
  containerStyle = {},
  labelStyle = {},
  inputStyle = {},
}) {
  const displayValue = (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value)))
    ? ''
    : format(value);
  return (
    <div style={{ maxWidth: 480, margin: '2px auto 0 auto', ...containerStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label htmlFor={id} style={{ fontWeight: 'bold', marginBottom: 0, ...labelStyle }}>{label}</label>
        <input
          id={id}
          type="text"
          size="10"
          className="form-control"
          readOnly
          value={displayValue}
          style={{ fontWeight: 'bold', fontSize: 18, color: '#2c3e50', background: '#f8f9fa', ...inputStyle }}
        />
      </div>
    </div>
  );
}
