import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = process.env.APP_JWT_SECRET
const APP_PASSWORD = process.env.APP_PASSWORD
const COOKIE_NAME = 'workout_auth'

if (!JWT_SECRET) {
  throw new Error('APP_JWT_SECRET não configurada. Defina uma string aleatória longa nas variáveis de ambiente.')
}
if (!APP_PASSWORD) {
  throw new Error('APP_PASSWORD não configurada. Defina a senha de acesso ao app nas variáveis de ambiente.')
}

export function checkPassword(password: string): boolean {
  return password === APP_PASSWORD
}

export function issueToken(): string {
  return jwt.sign({ sub: 'app-user' }, JWT_SECRET!, { expiresIn: '180d' })
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

export function isAuthenticated(req: Request): boolean {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return false
  try {
    jwt.verify(token, JWT_SECRET!)
    return true
  } catch {
    return false
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  next()
}
