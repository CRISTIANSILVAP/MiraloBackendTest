import { describe, expect, it } from 'vitest'
import { AppError } from '../src/shared/appError.js'

describe('AppError', () => {
  it('mantiene status, code y message', () => {
    const error = new AppError(400, 'INVALID_INPUT', 'Datos invalidos')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AppError')
    expect(error.statusCode).toBe(400)
    expect(error.code).toBe('INVALID_INPUT')
    expect(error.message).toBe('Datos invalidos')
  })
})

