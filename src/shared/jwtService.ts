import jwt from 'jsonwebtoken'
import { AppError } from './appError.js'
import type { GoogleJwtPayload } from '../modules/users/user.js'

export default class JwtService {
  constructor(private readonly secret: string) {}

  decodeGoogleToken(token: string): GoogleJwtPayload {
    try {
      const decoded = jwt.verify(token, this.secret)

      if (typeof decoded !== 'object' || !decoded) {
        throw new AppError(401, 'INVALID_TOKEN', 'Token inválido')
      }

      const { sub, email, name, picture, provider } = decoded as Record<string, unknown>

      if (!sub || !email || !name || provider !== 'google') {
        throw new AppError(
          401,
          'INVALID_TOKEN_PAYLOAD',
          'El token no contiene los datos requeridos'
        )
      }

      const payload: GoogleJwtPayload = {
        sub: String(sub),
        email: String(email),
        name: String(name)
      }

      if (picture) {
        payload.picture = String(picture)
      }

      return payload
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, 'INVALID_TOKEN', 'Token JWT inválido o expirado')
      }

      throw new AppError(401, 'TOKEN_ERROR', 'Error al procesar el token')
    }
  }
}
