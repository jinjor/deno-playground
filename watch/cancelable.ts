export class CancelablePromise<T> extends Promise<T> {
  private resolvers: any;
  private onCancel: () => void;
  constructor(f, onCancel = () => {}) {
    let resolvers: any = {};
    super((resolve, reject) => {
      resolvers.resolve = resolve;
      resolvers.reject = reject;
      return f(resolve, reject);
    });
    this.resolvers = resolvers;
    this.onCancel = onCancel;
  }
  cancel(error?: any) {
    this.onCancel();
    this.resolvers.reject(error);
  }
  done(value?: T) {
    this.onCancel();
    this.resolvers.resolve(value);
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
