export class CancelablePromise<T> extends Promise<T> {
  private resolvers: any;
  private onCancel: () => void;
  private finished: boolean;
  constructor(f, onCancel: () => void) {
    let resolvers: any = {};
    super((resolve, reject) => {
      resolvers.resolve = resolve;
      resolvers.reject = reject;
      return f(
        args => {
          if (this.finished) return;
          resolve.apply(null, args);
          this.finished = true;
        },
        args => {
          if (this.finished) return;
          reject.apply(null, args);
          this.finished = true;
        }
      );
    });
    this.resolvers = resolvers;
    this.onCancel = onCancel;
    this.finished = false;
  }
  cancel(error?: any) {
    if (this.finished) return;
    this.onCancel();
    this.resolvers.reject(error);
  }
  done(value: T) {
    if (this.finished) return;
    this.onCancel();
    this.resolvers.resolve(value);
  }
  terminate() {
    if (this.finished) return;
    this.onCancel();
  }
}
export function delay(time: number): CancelablePromise<void> {
  let timeout;
  return new CancelablePromise(
    resolve => {
      timeout = setTimeout(resolve, time);
    },
    () => {
      clearTimeout(timeout);
    }
  );
}
