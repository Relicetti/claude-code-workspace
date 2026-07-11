import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { Request, Response, NextFunction } from 'express'
import { pool } from './db.js'

const JWT_SECRET = process.env.APP_JWT_SECRET
const COOKIE_NAME = 'workout_auth'

if (!JWT_SECRET) {
  throw new Error('APP_JWT_SECRET não configurada. Defina uma string aleatória longa nas variáveis de ambiente.')
}

interface AuthTokenPayload {
  sub: number
  username: string
}

export async function checkCredentials(username: string, password: string): Promise<{ id: number; username: string } | null> {
  const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username])
  const user = result.rows[0] as { id: number; username: string; password_hash: string } | undefined
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  return valid ? { id: user.id, username: user.username } : null
}

export function issueToken(userId: number, username: string): string {
  return jwt.sign({ sub: userId, username }, JWT_SECRET!, { expiresIn: '180d' })
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 180 * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME)
}

function getUserFromRequest(req: Request): AuthTokenPayload | null {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET!) as unknown as AuthTokenPayload
  } catch {
    return null
  }
}

export function isAuthenticated(req: Request): boolean {
  return getUserFromRequest(req) !== null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  res.locals.userId = user.sub
  res.locals.username = user.username
  next()
}
