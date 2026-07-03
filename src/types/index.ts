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

// Free-form id referencing a workout within the active plan's sequence
export type WorkoutType = string

export interface WorkoutDay {
  id: WorkoutType
  label: string
  exercises: Exercise[]
}

export interface WorkoutPlan {
  workouts: WorkoutDay[]
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
  // Snapshot of the exercise's muscle groups at record time, so volume/progress
  // analytics don't depend on the exercise still being present in the current plan
  // (e.g. imported history or exercises later removed/substituted out of the plan).
  muscleGroups?: MuscleGroup[]
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
  caloriesBurned?: number | null
}

// Cardio tracking (independent of the strength workout plan/sequence)

export type CardioType = 'natacao' | 'corrida' | 'esteira' | 'bike' | 'sauna' | 'outro'

export interface CardioSession {
  id: string
  date: string
  type: CardioType
  customTypeLabel?: string
  durationSeconds: number
  distanceMeters: number | null
  caloriesBurned: number | null
  notes?: string
  createdAt: string
}

// Shape/physique tracking (weekly photo + fasting weight check-ins)

export type BodyPhotoAngle = 'frente' | 'lado' | 'costas'

export interface BodyPhoto {
  angle: BodyPhotoAngle
  dataUrl: string
}

export interface ShapeAssessment {
  id: string
  date: string
  weightKg: number
  photos: BodyPhoto[]
  aiAnalysis?: string | null
  createdAt: string
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
  targetWeight?: number
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
