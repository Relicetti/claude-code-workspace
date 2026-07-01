export type DayOfWeek = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo'

export type MuscleGroup =
  | 'peito'
  | 'costas'
  | 'ombro'
  | 'triceps'
  | 'biceps'
  | 'quadriceps'
  | 'posterior'
  | 'adutora'
  | 'abdutora'
  | 'panturrilha'
  | 'abdomen'
  | 'trapezio'

export interface Exercise {
  id: string
  name: string
  muscleGroups: MuscleGroup[]
  sets: number
  repsMin: number
  repsMax: number
  restSeconds: number
  intensityTechnique?: string
  notes?: string
  touchesShoulderAnterior?: boolean
}

export type WorkoutType = 'upper_a' | 'lower_a' | 'upper_b' | 'lower_b' | 'upper_c' | 'off'

export interface DayWorkout {
  day: DayOfWeek
  label: string
  type: WorkoutType
  exercises: Exercise[]
}

export interface WorkoutPlan {
  days: DayWorkout[]
  userNotes: string
}

// Session tracking types

export interface SetRecord {
  setNumber: number
  targetReps: number
  actualReps: number | null
  weight: number | null
  completedAt: string | null
  painNote?: string
}

export interface ExerciseRecord {
  exerciseId: string
  exerciseName: string
  sets: SetRecord[]
  completed: boolean
  skipped: boolean
  substituteReason?: string
  originalExerciseId?: string
}

export interface WorkoutSession {
  id: string
  date: string
  workoutType: WorkoutType
  workoutLabel: string
  exercises: ExerciseRecord[]
  startedAt: string
  finishedAt: string | null
  durationSeconds: number | null
  aiFeedback?: string
}

// Analytics types

export interface WeeklyAnalysis {
  id: string
  generatedAt: string
  weekStart: string
  weekEnd: string
  summary: string
  volumeByMuscle: Record<string, number>
  adjustments: WorkoutAdjustment[]
  applied: boolean[]
}

export interface WorkoutAdjustment {
  type: 'increase_weight' | 'decrease_volume' | 'increase_volume' | 'swap_exercise' | 'rest_exercise'
  exerciseId?: string
  exerciseName: string
  suggestion: string
  justification: string
  targetSets?: number
  targetRepsMin?: number
  targetRepsMax?: number
  substituteExerciseName?: string
}

// AI response types

export interface ExerciseAlternative {
  name: string
  sets: number
  repsMin: number
  repsMax: number
  reason: string
}

export interface AIAlternativesResponse {
  alternatives: ExerciseAlternative[]
}

export interface AIAnalyticsResponse {
  summary: string
  adjustments: WorkoutAdjustment[]
}

// Progress comparison

export interface ExerciseProgress {
  exerciseId: string
  exerciseName: string
  previousAvgWeight: number | null
  currentAvgWeight: number | null
  previousAvgReps: number | null
  currentAvgReps: number | null
  trend: 'up' | 'down' | 'same' | 'new'
}
