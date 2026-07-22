export type BoardRoute = readonly [string, number, 'tasks', number, 'boards', ...(number | string)[]];

export function buildBoardRoute(
  projectId: number,
  taskId: number,
  boardId?: number,
  ...segments: readonly string[]
): BoardRoute {
  const route: (string | number)[] = [
    '/modules/kanban/projects',
    projectId,
    'tasks',
    taskId,
    'boards',
  ];
  if (boardId !== undefined) {
    route.push(boardId, ...segments);
  }
  return route as unknown as BoardRoute;
}
