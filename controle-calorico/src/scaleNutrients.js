export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'caffeine', 'water']

// Rescales the nutrient fields of `values` by `ratio` (e.g. newQuantity/oldQuantity),
// rounding to one decimal so repeated edits don't accumulate floating-point noise.
export function scaleNutrients(values, ratio) {
  const scaled = {}
  for (const key of NUTRIENT_KEYS) {
    scaled[key] = Math.round((values[key] || 0) * ratio * 10) / 10
  }
  return scaled
}

// Applies a new quantity to a form object, scaling its nutrient fields
// proportionally against the quantity it previously held. If there's no
// valid previous quantity to scale from, just records the new quantity.
export function applyQuantityChange(form, newQuantity) {
  const oldQuantity = Number(form.quantity) || 0
  if (oldQuantity > 0 && newQuantity > 0) {
    const ratio = newQuantity / oldQuantity
    return { ...form, quantity: newQuantity, ...scaleNutrients(form, ratio) }
  }
  return { ...form, quantity: newQuantity }
}
