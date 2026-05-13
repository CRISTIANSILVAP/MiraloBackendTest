import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import JwtService from '../src/shared/jwtService.js'
import { AppError } from '../src/shared/appError.js'

const getAppErrorCode = (fn: () => unknown): string => {
  let capturedError: unknown

  try {
    fn()
  } catch (error) {
    capturedError = error
  }

  if (!(capturedError instanceof AppError)) {
    throw new Error('Se esperaba un error AppError')
  }

  return capturedError.code
}

describe('JwtService.decodeGoogleToken', () => {
  const secret = 'test-secret'

  it('decodifica un token valido de Google', () => {
    const token = jwt.sign(
      {
        sub: 'google-sub',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://img.example.com/a.png',
        provider: 'google'
      },
      secret
    )

    const service = new JwtService(secret)
    const payload = service.decodeGoogleToken(token)

    expect(payload).toEqual({
      sub: 'google-sub',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://img.example.com/a.png'
    })
  })

  it('falla cuando el payload no tiene provider google', () => {
    const token = jwt.sign(
      {
        sub: 'google-sub',
        email: 'test@example.com',
        name: 'Test User',
        provider: 'github'
      },
      secret
    )

    const service = new JwtService(secret)
    expect(getAppErrorCode(() => service.decodeGoogleToken(token))).toBe('INVALID_TOKEN_PAYLOAD')
  })

  it('falla cuando el payload decodificado es string', () => {
    const token = jwt.sign('solo-texto', secret)
    const service = new JwtService(secret)

    expect(getAppErrorCode(() => service.decodeGoogleToken(token))).toBe('INVALID_TOKEN')
  })

  it('mapea JsonWebTokenError a INVALID_TOKEN', () => {
    const service = new JwtService(secret)
    expect(getAppErrorCode(() => service.decodeGoogleToken('token-basura'))).toBe('INVALID_TOKEN')
  })

  it('mapea errores inesperados a TOKEN_ERROR', () => {
    const service = new JwtService(secret)
    const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('boom')
    })

    expect(getAppErrorCode(() => service.decodeGoogleToken('x'))).toBe('TOKEN_ERROR')

    verifySpy.mockRestore()
  })
})
