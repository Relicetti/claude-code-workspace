import type { ExerciseLibraryEntry, MuscleGroup } from '@/types'

// Built-in reference list of common gym exercises, each with the alternate
// names/equipment-brand variants that mean the same movement. Users can add
// more via the "Biblioteca de exercícios" section in the Plano tab — those
// are merged with this list at runtime, never edited here.
export const BUILT_IN_EXERCISE_LIBRARY: ExerciseLibraryEntry[] = [
  // Peito
  { id: 'lib_supino_reto', name: 'Supino reto', muscleGroups: ['peito', 'triceps', 'ombro'], aliases: ['supino reto máquina', 'supino reto barra/máquina', 'supino reto barra', 'supino reto halteres'] },
  { id: 'lib_supino_inclinado', name: 'Supino inclinado', muscleGroups: ['peito', 'ombro', 'triceps'], aliases: ['supino inclinado máquina', 'supino inclinado halter', 'supino inclinado barra', 'supino inclinado/máquina'] },
  { id: 'lib_supino_declinado', name: 'Supino declinado', muscleGroups: ['peito', 'triceps'], aliases: ['supino declinado máquina', 'supino declinado barra'] },
  { id: 'lib_peck_deck', name: 'Peck deck', muscleGroups: ['peito'], aliases: ['crucifixo', 'crucifixo máquina', 'crucifixo/peck deck', 'fly machine (peck deck)', 'fly machine', 'crucifixo hammer', 'crucifixo halteres', 'crucifixo hammer strength', 'peckdeck', 'peck-deck'] },
  { id: 'lib_crossover', name: 'Crossover (cabo cruzado)', muscleGroups: ['peito'], aliases: ['cross over', 'crucifixo cabo', 'crucifixo polia'] },
  { id: 'lib_flexao', name: 'Flexão de braço', muscleGroups: ['peito', 'triceps', 'ombro'], aliases: ['flexão', 'push up', 'flexão de solo'] },

  // Costas
  { id: 'lib_puxada_aberta', name: 'Puxada frente aberta', muscleGroups: ['costas'], aliases: ['puxada frente pegada aberta', 'puxada frente/barra fixa', 'puxada aberta'] },
  { id: 'lib_puxada_neutra', name: 'Puxada pegada neutra', muscleGroups: ['costas'], aliases: ['puxada neutra'] },
  { id: 'lib_puxada_fechada', name: 'Puxada pegada fechada', muscleGroups: ['costas'], aliases: ['puxada máquina pegada fechada', 'puxada fechada'] },
  { id: 'lib_barra_fixa', name: 'Barra fixa', muscleGroups: ['costas', 'biceps'], aliases: ['pull up', 'barra'] },
  { id: 'lib_remada_baixa', name: 'Remada baixa', muscleGroups: ['costas'], aliases: ['remada máquina baixa', 'remada baixa cabo', 'remada baixa triângulo', 'puxada baixa triângulo (cabo)'] },
  { id: 'lib_remada_alta', name: 'Remada alta', muscleGroups: ['costas', 'trapezio'], aliases: ['remada máquina alta'] },
  { id: 'lib_remada_curvada', name: 'Remada curvada', muscleGroups: ['costas', 'biceps'], aliases: ['remada curvada/cavalinho', 'remada cavalinho', 'remada barra'] },
  { id: 'lib_pulldown_unilateral', name: 'Pulldown unilateral', muscleGroups: ['costas'], aliases: [] },
  { id: 'lib_puxada_remada_maquina', name: 'Puxada/remada máquina', muscleGroups: ['costas'], aliases: [] },
  { id: 'lib_levantamento_terra', name: 'Levantamento terra', muscleGroups: ['posterior', 'costas'], aliases: ['deadlift', 'terra'] },

  // Ombro
  { id: 'lib_desenvolvimento', name: 'Desenvolvimento', muscleGroups: ['ombro', 'triceps'], aliases: ['desenvolvimento máquina', 'desenvolvimento halter', 'desenvolvimento militar', 'desenvolvimento máquina (pegada neutra, amplitude reduzida)', 'desenvolvimento máquina (pegada neutra)'] },
  { id: 'lib_elevacao_lateral', name: 'Elevação lateral', muscleGroups: ['ombro'], aliases: ['elevação lateral máquina', 'elevação lateral (halteres ou cabos, amplitude reduzida)', 'elevação lateral cabo'] },
  { id: 'lib_elevacao_frontal', name: 'Elevação frontal', muscleGroups: ['ombro'], aliases: [] },
  { id: 'lib_face_pull', name: 'Face pull', muscleGroups: ['ombro'], aliases: ['face pull / rear delt', 'face pull rear delt'] },
  { id: 'lib_encolhimento', name: 'Encolhimento', muscleGroups: ['trapezio'], aliases: ['shrug'] },

  // Bíceps
  { id: 'lib_rosca_direta', name: 'Rosca direta', muscleGroups: ['biceps'], aliases: ['rosca direta barra', 'rosca direta halteres'] },
  { id: 'lib_rosca_scott', name: 'Rosca scott', muscleGroups: ['biceps'], aliases: ['rosca scott máquina', 'rosca preacher'] },
  { id: 'lib_rosca_martelo', name: 'Rosca martelo', muscleGroups: ['biceps'], aliases: ['rosca martelo polia', 'rosca alternada/martelo', 'rosca alternada'] },
  { id: 'lib_rosca_maquina', name: 'Rosca máquina', muscleGroups: ['biceps'], aliases: [] },
  { id: 'lib_rosca_concentrada', name: 'Rosca concentrada', muscleGroups: ['biceps'], aliases: [] },

  // Tríceps
  { id: 'lib_triceps_corda', name: 'Tríceps corda', muscleGroups: ['triceps'], aliases: ['tríceps corda polia'] },
  { id: 'lib_triceps_testa', name: 'Tríceps testa', muscleGroups: ['triceps'], aliases: ['tríceps francês', 'tríceps francês/testa', 'tríceps testa/francês'] },
  { id: 'lib_triceps_maquina', name: 'Tríceps máquina', muscleGroups: ['triceps'], aliases: ['tríceps máquina (extensão)', 'tríceps extensão'] },
  { id: 'lib_triceps_coice', name: 'Tríceps coice', muscleGroups: ['triceps'], aliases: ['kickback'] },
  { id: 'lib_mergulho', name: 'Mergulho (dips)', muscleGroups: ['triceps', 'peito'], aliases: ['dips', 'paralelas'] },

  // Quadríceps
  { id: 'lib_agachamento_livre', name: 'Agachamento livre', muscleGroups: ['quadriceps', 'posterior'], aliases: ['agachamento livre/smith', 'agachamento smith', 'agachamento'] },
  { id: 'lib_leg_press', name: 'Leg press', muscleGroups: ['quadriceps', 'posterior'], aliases: ['leg press 45°', 'leg press 45', 'leg press horizontal'] },
  { id: 'lib_cadeira_extensora', name: 'Cadeira extensora', muscleGroups: ['quadriceps'], aliases: [] },
  { id: 'lib_afundo', name: 'Afundo', muscleGroups: ['quadriceps', 'posterior'], aliases: ['passada', 'lunge', 'avanço'] },
  { id: 'lib_hack_machine', name: 'Hack machine', muscleGroups: ['quadriceps', 'posterior'], aliases: ['hack machine (posterior) ou leg press pé alto', 'hack squat'] },

  // Posterior
  { id: 'lib_stiff', name: 'Stiff', muscleGroups: ['posterior'], aliases: ['stiff máquina/polia', 'stiff/levantamento romeno', 'levantamento terra romeno', 'romeno'] },
  { id: 'lib_mesa_flexora', name: 'Mesa flexora', muscleGroups: ['posterior'], aliases: [] },
  { id: 'lib_cadeira_flexora', name: 'Cadeira flexora', muscleGroups: ['posterior'], aliases: ['cadeira flexora unilateral'] },
  { id: 'lib_elevacao_pelvica', name: 'Elevação pélvica', muscleGroups: ['posterior'], aliases: ['hip thrust'] },
  { id: 'lib_good_morning', name: 'Good morning', muscleGroups: ['posterior'], aliases: [] },

  // Adutora / Abdutora
  { id: 'lib_cadeira_adutora', name: 'Cadeira adutora', muscleGroups: ['adutora'], aliases: [] },
  { id: 'lib_cadeira_abdutora', name: 'Cadeira abdutora', muscleGroups: ['abdutora'], aliases: [] },

  // Panturrilha
  { id: 'lib_panturrilha_pe', name: 'Panturrilha em pé', muscleGroups: ['panturrilha'], aliases: [] },
  { id: 'lib_panturrilha_sentado', name: 'Panturrilha sentado', muscleGroups: ['panturrilha'], aliases: [] },
  { id: 'lib_panturrilha_maquina', name: 'Panturrilha máquina', muscleGroups: ['panturrilha'], aliases: ['panturrilha leg press'] },

  // Abdômen
  { id: 'lib_abdomen_maquina', name: 'Abdômen máquina', muscleGroups: ['abdomen'], aliases: [] },
  { id: 'lib_abdomen_infra', name: 'Abdômen infra', muscleGroups: ['abdomen'], aliases: [] },
  { id: 'lib_prancha', name: 'Prancha', muscleGroups: ['abdomen'], aliases: ['core (prancha/abdominal)', 'plank'] },
  { id: 'lib_elevacao_pernas', name: 'Elevação de pernas', muscleGroups: ['abdomen'], aliases: [] },
]

function norm(s: string): string {
  return s.trim().toLowerCase()
}

// Spacing/hyphenation varies a lot between gyms ("peck deck" vs "peckdeck"
// vs "peck-deck") without being a different exercise — comparing with those
// stripped catches that whole class of variant without listing every one by
// hand as a literal alias.
function tightNorm(s: string): string {
  return norm(s).replace(/[\s-]+/g, '')
}

// Exact name/alias match first (loose, then tight), then substring
// ("Crucifixo Hammer Strength" contains the "crucifixo" alias) — never
// substring before exact, or a short alias could wrongly match inside an
// unrelated longer name.
export function findLibraryMatch(rawName: string, library: ExerciseLibraryEntry[]): ExerciseLibraryEntry | null {
  const key = norm(rawName)
  const tightKey = tightNorm(rawName)
  for (const entry of library) {
    if (norm(entry.name) === key || entry.aliases.some(a => norm(a) === key)) return entry
  }
  for (const entry of library) {
    if (tightNorm(entry.name) === tightKey || entry.aliases.some(a => tightNorm(a) === tightKey)) return entry
  }
  for (const entry of library) {
    const candidates = [entry.name, ...entry.aliases]
    if (candidates.some(c => key.includes(norm(c)))) return entry
  }
  for (const entry of library) {
    const candidates = [entry.name, ...entry.aliases]
    if (candidates.some(c => tightKey.includes(tightNorm(c)))) return entry
  }
  return null
}

export function canonicalExerciseName(rawName: string, customEntries: ExerciseLibraryEntry[] = []): string {
  const match = findLibraryMatch(rawName, [...BUILT_IN_EXERCISE_LIBRARY, ...customEntries])
  return match?.name ?? rawName
}

export function suggestMuscleGroups(rawName: string, customEntries: ExerciseLibraryEntry[] = []): MuscleGroup[] | null {
  const match = findLibraryMatch(rawName, [...BUILT_IN_EXERCISE_LIBRARY, ...customEntries])
  return match?.muscleGroups ?? null
}
