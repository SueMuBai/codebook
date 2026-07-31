/**
 * Serializes async work so nested SQLite / IDB writers don't interleave.
 */
export class SerialTaskQueue {
  private chain: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task)
    this.chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}
