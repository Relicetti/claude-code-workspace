import type { MuscleGroup } from '@/types'

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  peito: 'Peito',
  costas: 'Costas',
  ombro: 'Ombro',
  triceps: 'Tríceps',
  biceps: 'Bíceps',
  quadriceps: 'Quadríceps',
  posterior: 'Posterior',
  adutora: 'Adutora',
  abdutora: 'Abdutora',
  panturrilha: 'Panturrilha',
  abdomen: 'Abdômen',
  trapezio: 'Trapézio',
}

export const ALL_MUSCLE_GROUPS = Object.keys(MUSCLE_LABELS) as MuscleGroup[]
