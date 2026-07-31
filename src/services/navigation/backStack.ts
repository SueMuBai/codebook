type BackHandler = () => boolean | Promise<boolean>

const handlers: BackHandler[] = []

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export function dispatchBackHandler(): boolean | Promise<boolean> {
  const handler = handlers[handlers.length - 1]
  return handler ? handler() : false
}
