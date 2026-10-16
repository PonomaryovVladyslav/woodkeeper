export const queryKeys = {
  config: ['config'],
  me: ['me'],
  projects: ['projects'],
  boards: ['boards'],
  projectBoards: (projectId: number) => ['boards', projectId] as const,
} as const
