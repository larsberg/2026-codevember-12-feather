// Material schema and editor structure inherited from 02-shatter-drafting,
// with groups corresponding to this rig's actual rendered surfaces.
export const materialFields = [
  ['metalness', 'Metalness', 0, 1, .01, .65],
  ['roughness', 'Roughness', 0, 1, .005, .28],
  ['emissiveIntensity', 'Emission strength', 0, 5, .01, 0],
  ['envMapIntensity', 'Environment intensity', 0, 3, .01, 1],
  ['opacity', 'Opacity', 0, 1, .005, 1],
];
export const materialFieldsFor = group => group === 'panels'
  ? materialFields.map(field => field[0] === 'opacity' ? [field[0], 'Skin opacity', ...field.slice(2)] : field) : materialFields;
export const materialGroups = [['panels', 'Blob skin'], ['struts', 'Feather vanes'], ['pistons', 'Mirror frame'], ['joints', 'Quills and details']];
export function defaultMaterials() {
  const defaults = Object.fromEntries(materialGroups.map(([group]) => [group, {
    ...Object.fromEntries(materialFieldsFor(group).map(([key,,,,,value]) => [key, value])),
    color: '#ffffff', emissive: '#ffffff', wireframe: false, flatShading: false,
  }]));
  Object.assign(defaults.struts, { color: '#ffffff', roughness: .7, metalness: .04, envMapIntensity: .5 });
  Object.assign(defaults.pistons, { color: '#b99a55', roughness: .3, metalness: .72 });
  Object.assign(defaults.joints, { color: '#e7c786', roughness: .48, metalness: .3 });
  Object.assign(defaults.panels, { color: '#ffffff', roughness: .3, metalness: .12, opacity: 1,
    envMapIntensity: 1, depthWrite: true, flatShading: true });
  return defaults;
}
export function validateMaterials(value) {
  const result = defaultMaterials();
  for (const [group, defaults] of Object.entries(result)) for (const [key, initial] of Object.entries(defaults)) {
    const field = value?.[group]?.[key] ?? initial, range = materialFieldsFor(group).find(([name]) => name === key);
    const valid = range ? Number.isFinite(field) && field >= range[2] && field <= range[3]
      : typeof initial === 'boolean' ? typeof field === 'boolean' : typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field);
    if (!valid) throw Error(`Invalid materials.${group}.${key}.`);
    result[group][key] = typeof field === 'string' ? field.toLowerCase() : field;
  }
  return result;
}

export function applyMaterialSettings(material, values, group) {
  const flatShading = values.flatShading;
  const transparent = values.opacity < 1;
  if (material.flatShading !== flatShading || material.transparent !== transparent) material.needsUpdate = true;
  material.transparent = transparent; material.depthWrite = group === 'panels' ? values.depthWrite : !transparent;
  material.color.set(values.color); material.emissive.set(values.emissive);
  material.wireframe = values.wireframe; material.flatShading = flatShading;
  for (const [key] of materialFieldsFor(group)) material[key] = values[key];
  if (group === 'panels') {
    material.forceSinglePass = true;
  }
}
