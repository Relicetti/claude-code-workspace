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
  isAdmin: boolean
}

export async function checkCredentials(
  username: string,
  password: string,
): Promise<{ id: number; username: string; isAdmin: boolean } | null> {
  const result = await pool.query('SELECT id, username, password_hash, is_admin FROM users WHERE username = $1', [username])
  const user = result.rows[0] as { id: number; username: string; password_hash: string; is_admin: boolean } | undefined
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  return valid ? { id: user.id, username: user.username, isAdmin: user.is_admin } : null
}

export function issueToken(userId: number, username: string, isAdmin: boolean): string {
  return jwt.sign({ sub: userId, username, isAdmin }, JWT_SECRET!, { expiresIn: '180d' })
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

export function getSessionInfo(req: Request): { authenticated: boolean; isAdmin: boolean } {
  const user = getUserFromRequest(req)
  return { authenticated: user !== null, isAdmin: user?.isAdmin ?? false }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  res.locals.userId = user.sub
  res.locals.username = user.username
  res.locals.isAdmin = user.isAdmin
  next()
}

// Old sessions (issued before admin roles existed) verify fine but carry no
// isAdmin claim — falls through to the 403 below until the user logs in again,
// rather than silently granting admin access to a stale token.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.isAdmin) {
    res.status(403).json({ error: 'acesso restrito ao administrador' })
    return
  }
  next()
}
