import type { DayWorkout, WorkoutPlan, WorkoutType } from '@/types'

const segunda: DayWorkout = {
  day: 'segunda',
  label: 'Upper A — Peito Foco',
  type: 'upper_a',
  exercises: [
    {
      id: 'ua_supino_maq',
      name: 'Supino reto máquina',
      muscleGroups: ['peito', 'triceps', 'ombro'],
      sets: 4,
      repsMin: 8,
      repsMax: 10,
      restSeconds: 90,
      touchesShoulderAnterior: true,
    },
    {
      id: 'ua_fly_maq',
      name: 'Fly machine (peck deck)',
      muscleGroups: ['peito'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
      touchesShoulderAnterior: true,
    },
    {
      id: 'ua_puxada_aberta',
      name: 'Puxada frente pegada aberta',
      muscleGroups: ['costas'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'ua_remada_baixa',
      name: 'Remada máquina baixa',
      muscleGroups: ['costas'],
      sets: 3,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'ua_elev_lat_maq',
      name: 'Elevação lateral máquina',
      muscleGroups: ['ombro'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 60,
    },
    {
      id: 'ua_triceps_corda',
      name: 'Tríceps corda',
      muscleGroups: ['triceps'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
    },
    {
      id: 'ua_face_pull',
      name: 'Face pull',
      muscleGroups: ['ombro'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
      notes: 'Reforço manguito rotador — prioridade',
    },
  ],
}

const terca: DayWorkout = {
  day: 'terca',
  label: 'Lower A',
  type: 'lower_a',
  exercises: [
    {
      id: 'la_leg_press',
      name: 'Leg press 45°',
      muscleGroups: ['quadriceps', 'posterior'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'la_cadeira_ext',
      name: 'Cadeira extensora',
      muscleGroups: ['quadriceps'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
    },
    {
      id: 'la_mesa_flex',
      name: 'Mesa flexora',
      muscleGroups: ['posterior'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'la_cadeira_adut',
      name: 'Cadeira adutora',
      muscleGroups: ['adutora'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
    },
    {
      id: 'la_panturrilha',
      name: 'Panturrilha máquina',
      muscleGroups: ['panturrilha'],
      sets: 4,
      repsMin: 15,
      repsMax: 20,
      restSeconds: 45,
    },
    {
      id: 'la_abdomen',
      name: 'Abdômen máquina',
      muscleGroups: ['abdomen'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
    },
  ],
}

const quarta: DayWorkout = {
  day: 'quarta',
  label: 'Upper B — Costas Foco + Ombro Posterior',
  type: 'upper_b',
  exercises: [
    {
      id: 'ub_puxada_neutra',
      name: 'Puxada pegada neutra',
      muscleGroups: ['costas'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'ub_remada_alta',
      name: 'Remada máquina alta',
      muscleGroups: ['costas', 'trapezio'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'ub_pulldown_uni',
      name: 'Pulldown unilateral',
      muscleGroups: ['costas'],
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      restSeconds: 60,
    },
    {
      id: 'ub_face_pull_rear',
      name: 'Face pull / rear delt',
      muscleGroups: ['ombro'],
      sets: 4,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
      notes: 'Reforço manguito rotador — prioridade',
    },
    {
      id: 'ub_rosca_scott',
      name: 'Rosca scott máquina',
      muscleGroups: ['biceps'],
      sets: 3,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 60,
    },
    {
      id: 'ub_rosca_martelo',
      name: 'Rosca martelo polia',
      muscleGroups: ['biceps'],
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      restSeconds: 60,
    },
    {
      id: 'ub_encolhimento',
      name: 'Encolhimento',
      muscleGroups: ['trapezio'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
    },
  ],
}

const quinta: DayWorkout = {
  day: 'quinta',
  label: 'Descanso',
  type: 'off',
  exercises: [],
}

const sexta: DayWorkout = {
  day: 'sexta',
  label: 'Lower B',
  type: 'lower_b',
  exercises: [
    {
      id: 'lb_hack_machine',
      name: 'Hack machine (posterior) ou leg press pé alto',
      muscleGroups: ['quadriceps', 'posterior'],
      sets: 4,
      repsMin: 10,
      repsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'lb_stiff',
      name: 'Stiff máquina/polia',
      muscleGroups: ['posterior'],
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'lb_cadeira_flex_uni',
      name: 'Cadeira flexora unilateral',
      muscleGroups: ['posterior'],
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      restSeconds: 60,
    },
    {
      id: 'lb_cadeira_abdut',
      name: 'Cadeira abdutora',
      muscleGroups: ['abdutora'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
    },
    {
      id: 'lb_panturrilha_pe',
      name: 'Panturrilha em pé',
      muscleGroups: ['panturrilha'],
      sets: 4,
      repsMin: 15,
      repsMax: 20,
      restSeconds: 45,
    },
    {
      id: 'lb_abdomen_infra',
      name: 'Abdômen infra',
      muscleGroups: ['abdomen'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
    },
  ],
}

const sabado: DayWorkout = {
  day: 'sabado',
  label: 'Upper C — Ombro Controlado + Braços',
  type: 'upper_c',
  exercises: [
    {
      id: 'uc_desenv_maq',
      name: 'Desenvolvimento máquina (pegada neutra, amplitude reduzida)',
      muscleGroups: ['ombro'],
      sets: 4,
      repsMin: 10,
      repsMax: 10,
      restSeconds: 90,
      touchesShoulderAnterior: true,
      notes: 'Só fazer se não sentir dor anterior no ombro. Se doer, substituir por mais elevação lateral.',
    },
    {
      id: 'uc_elev_lat_maq',
      name: 'Elevação lateral máquina',
      muscleGroups: ['ombro'],
      sets: 4,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 60,
      intensityTechnique: 'Dropset na última série',
    },
    {
      id: 'uc_peck_deck',
      name: 'Peck deck',
      muscleGroups: ['peito'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 60,
      touchesShoulderAnterior: true,
    },
    {
      id: 'uc_puxada_fechada',
      name: 'Puxada máquina pegada fechada',
      muscleGroups: ['costas'],
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      restSeconds: 90,
    },
    {
      id: 'uc_triceps_maq',
      name: 'Tríceps máquina (extensão)',
      muscleGroups: ['triceps'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
      intensityTechnique: 'Rest-pause na última série',
    },
    {
      id: 'uc_rosca_maq',
      name: 'Rosca máquina',
      muscleGroups: ['biceps'],
      sets: 3,
      repsMin: 12,
      repsMax: 15,
      restSeconds: 60,
      intensityTechnique: 'Dropset na última série',
    },
    {
      id: 'uc_face_pull',
      name: 'Face pull',
      muscleGroups: ['ombro'],
      sets: 3,
      repsMin: 15,
      repsMax: 15,
      restSeconds: 45,
      notes: 'Reforço manguito rotador — sempre fazer',
    },
  ],
}

const domingo: DayWorkout = {
  day: 'domingo',
  label: 'Descanso',
  type: 'off',
  exercises: [],
}

export const workoutPlan: WorkoutPlan = {
  days: [segunda, terca, quarta, quinta, sexta, sabado, domingo],
  userNotes: `Contexto clínico relevante: tenho uma lesão no ombro anterior (dor provável no tendão do bíceps / manguito rotador anterior), provocada principalmente por supino inclinado com halteres e desenvolvimento com halteres. Por isso o plano prioriza máquinas, evita amplitude excessiva, e usa face pull / rotação externa como reforço do manguito em quase todo treino de upper.

Fase atual: saindo de cutting (2200 kcal) para superávit calórico, priorizando hipertrofia. Volume semanal por grupo deve estar entre 10-20 séries para otimizar hipertrofia.

Restrições importantes para sugestão de exercícios:
- EVITAR: supino inclinado com halteres, desenvolvimento com halteres, qualquer variação que force amplitude máxima no ombro anterior
- PREFERIR: máquinas com guias fixas, movimentos controlados, amplitude reduzida quando necessário
- SEMPRE incluir face pull / rotação externa nos dias de upper como reforço preventivo`,
}

export function getTodayWorkout(): DayWorkout {
  const dayIndex = new Date().getDay()
  // JS: 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
  const map = [6, 0, 1, 2, 3, 4, 5] // reorder to match our array (seg=0)
  return workoutPlan.days[map[dayIndex]]
}

export function getWorkoutByType(type: WorkoutType): DayWorkout | undefined {
  return workoutPlan.days.find(d => d.type === type)
}

