import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/shared/appError.ts',
        'src/shared/jwtService.ts',
        'src/modules/users/userService.ts',
        'src/modules/rooms/roomService.ts',
        'src/modules/chats/chatService.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80
      }
    }
  }
})

